// Command digger serves the browser version of Digger, keeps its high scores
// and pairs up the players of network games.
package main

import (
	"embed"
	"flag"
	"io/fs"
	"log"
	"net/http"
)

//go:embed web
var webFiles embed.FS

func main() {
	addr := flag.String("addr", ":8080", "address to listen on")
	scoresFile := flag.String("scores", "scores.json", "file to keep the high scores in")
	flag.Parse()

	scores, err := OpenScores(*scoresFile)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("Digger is on http://localhost%s", *addr)
	log.Fatal(http.ListenAndServe(*addr, newHandler(scores, NewRooms())))
}

func newHandler(scores *Scores, rooms *Rooms) http.Handler {
	web, err := fs.Sub(webFiles, "web")
	if err != nil {
		panic(err) // the embedded files are always there
	}
	mux := http.NewServeMux()
	mux.Handle("/", http.FileServerFS(web))
	mux.Handle("/api/scores", scores)
	mux.Handle("/ws", rooms)
	return mux
}
