package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"regexp"
	"slices"
	"sync"
)

// TableSize is the number of high scores kept for each kind of game.
const TableSize = 10

// Each kind of game has its own high scores.
var modes = []string{"normal1", "normal2", "gauntlet1", "gauntlet2"}

var nameRe = regexp.MustCompile(`^[A-Z0-9.]{1,3}$`)

// Entry is a high score.
type Entry struct {
	Name  string `json:"name"`
	Score int    `json:"score"`
}

// Scores are the high score tables, kept in a JSON file.
type Scores struct {
	path string

	mu     sync.Mutex
	tables map[string][]Entry
}

// OpenScores loads the high scores from path, if there are any yet.
func OpenScores(path string) (*Scores, error) {
	s := &Scores{path: path, tables: map[string][]Entry{}}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, &s.tables); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return s, nil
}

// Table returns the high scores of a kind of game, best first.
func (s *Scores) Table(mode string) []Entry {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.Clone(s.tables[mode])
}

// Add puts e into the high scores of mode if it is high enough, and returns
// the table. A score goes below the higher ones and above those as high.
func (s *Scores) Add(mode string, e Entry) ([]Entry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	table := s.tables[mode]
	i := slices.IndexFunc(table, func(o Entry) bool { return o.Score <= e.Score })
	if i < 0 {
		i = len(table)
	}
	if i >= TableSize {
		return slices.Clone(table), nil
	}
	table = slices.Insert(table, i, e)
	if len(table) > TableSize {
		table = table[:TableSize]
	}
	s.tables[mode] = table
	if err := s.save(); err != nil {
		return nil, err
	}
	return slices.Clone(table), nil
}

func (s *Scores) save() error {
	data, err := json.MarshalIndent(s.tables, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// ServeHTTP handles GET /api/scores?mode=... with the table, and POST of an
// Entry to the same URL, answered with the table it is put in.
func (s *Scores) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	mode := r.URL.Query().Get("mode")
	if !slices.Contains(modes, mode) {
		http.Error(w, "unknown mode", http.StatusBadRequest)
		return
	}
	var table []Entry
	switch r.Method {
	case http.MethodGet:
		table = s.Table(mode)
	case http.MethodPost:
		var e Entry
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&e); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if !nameRe.MatchString(e.Name) || e.Score <= 0 {
			http.Error(w, "bad entry", http.StatusBadRequest)
			return
		}
		var err error
		if table, err = s.Add(mode, e); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if table == nil {
		table = []Entry{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(table)
}
