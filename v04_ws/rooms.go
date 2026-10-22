package main

import (
	"context"
	"encoding/json"
	"log"
	"math/rand/v2"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// Rooms pair up the players of network games: the first to join a room
// waits there for the second. Then each is told which player they are and
// the seed of the game's random numbers, and whatever one of them sends goes
// to the other. The game itself runs in the browsers, in step.
type Rooms struct {
	mu      sync.Mutex
	waiting map[string]*player
}

type player struct {
	conn *websocket.Conn

	mu   sync.Mutex
	peer *player
}

// Message is what the server sends: "start" (Player, Seed) and "left".
type Message struct {
	Type   string `json:"type"`
	Player int    `json:"player"`
	Seed   uint32 `json:"seed"`
}

const writeTimeout = 5 * time.Second

func NewRooms() *Rooms {
	return &Rooms{waiting: map[string]*player{}}
}

func (p *player) setPeer(peer *player) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.peer = peer
}

func (p *player) getPeer() *player {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.peer
}

func (p *player) write(typ websocket.MessageType, data []byte) error {
	ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
	defer cancel()
	return p.conn.Write(ctx, typ, data)
}

func (p *player) send(m Message) error {
	data, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return p.write(websocket.MessageText, data)
}

// ServeHTTP handles a player's WebSocket: {"type":"join","room":"..."} first.
func (rs *Rooms) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer conn.CloseNow()
	ctx := r.Context()

	var join struct {
		Type string `json:"type"`
		Room string `json:"room"`
	}
	_, data, err := conn.Read(ctx)
	if err != nil || json.Unmarshal(data, &join) != nil || join.Type != "join" || join.Room == "" {
		conn.Close(websocket.StatusPolicyViolation, "join a room first")
		return
	}

	p := &player{conn: conn}
	if other := rs.join(join.Room, p); other != nil {
		other.setPeer(p)
		p.setPeer(other)
		seed := rand.Uint32()
		if other.send(Message{Type: "start", Player: 0, Seed: seed}) != nil ||
			p.send(Message{Type: "start", Player: 1, Seed: seed}) != nil {
			log.Printf("room %q: the game could not start", join.Room)
		}
	}

	// Pass on what the player sends, till they go
	for {
		typ, data, err := conn.Read(ctx)
		if err != nil {
			break
		}
		if peer := p.getPeer(); peer != nil {
			peer.write(typ, data)
		}
	}
	rs.leave(join.Room, p)
	if peer := p.getPeer(); peer != nil {
		peer.send(Message{Type: "left"})
	}
}

// join returns the player waiting in room for p, or has p wait there.
func (rs *Rooms) join(room string, p *player) *player {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	if other, ok := rs.waiting[room]; ok {
		delete(rs.waiting, room)
		return other
	}
	rs.waiting[room] = p
	return nil
}

func (rs *Rooms) leave(room string, p *player) {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	if rs.waiting[room] == p {
		delete(rs.waiting, room)
	}
}
