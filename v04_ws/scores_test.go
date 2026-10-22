package main

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestAdd(t *testing.T) {
	path := filepath.Join(t.TempDir(), "scores.json")
	s, err := OpenScores(path)
	if err != nil {
		t.Fatal(err)
	}
	for i := range TableSize + 2 {
		if _, err := s.Add("normal1", Entry{Name: "AAA", Score: (i + 1) * 100}); err != nil {
			t.Fatal(err)
		}
	}
	table, err := s.Add("normal1", Entry{Name: "NEW", Score: 1000})
	if err != nil {
		t.Fatal(err)
	}
	if len(table) != TableSize {
		t.Fatalf("got %d entries, want %d", len(table), TableSize)
	}
	// Above the score as high as it
	if table[2] != (Entry{"NEW", 1000}) || table[3].Score != 1000 {
		t.Errorf("table = %v", table)
	}
	if table[TableSize-1].Score != 400 {
		t.Errorf("lowest score = %d, want 400", table[TableSize-1].Score)
	}

	reopened, err := OpenScores(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := reopened.Table("normal1"); !slices.Equal(got, table) {
		t.Errorf("after reopening: %v, want %v", got, table)
	}
}

func TestServeHTTP(t *testing.T) {
	s, err := OpenScores(filepath.Join(t.TempDir(), "scores.json"))
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		method, url, body string
		code              int
		want              string
	}{
		{"GET", "/api/scores?mode=normal1", "", 200, "[]\n"},
		{"POST", "/api/scores?mode=normal1", `{"name":"ABC","score":500}`, 200, `[{"name":"ABC","score":500}]` + "\n"},
		{"GET", "/api/scores?mode=normal1", "", 200, `[{"name":"ABC","score":500}]` + "\n"},
		{"GET", "/api/scores?mode=gauntlet2", "", 200, "[]\n"},
		{"GET", "/api/scores?mode=other", "", 400, ""},
		{"POST", "/api/scores?mode=normal1", `{"name":"<script>","score":500}`, 400, ""},
		{"DELETE", "/api/scores?mode=normal1", "", 405, ""},
	}
	for _, tt := range tests {
		r := httptest.NewRequest(tt.method, tt.url, strings.NewReader(tt.body))
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		if w.Code != tt.code {
			t.Errorf("%s %s: code %d, want %d", tt.method, tt.url, w.Code, tt.code)
		}
		if tt.code == http.StatusOK && w.Body.String() != tt.want {
			t.Errorf("%s %s: %q, want %q", tt.method, tt.url, w.Body.String(), tt.want)
		}
	}
}

func TestHandler(t *testing.T) {
	s, err := OpenScores(filepath.Join(t.TempDir(), "scores.json"))
	if err != nil {
		t.Fatal(err)
	}
	h := newHandler(s, NewRooms())
	for _, url := range []string{"/", "/js/main.js", "/api/scores?mode=normal1"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", url, nil))
		if w.Code != http.StatusOK {
			t.Errorf("GET %s: code %d", url, w.Code)
		}
	}
}
