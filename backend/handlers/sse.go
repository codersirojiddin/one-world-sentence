package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

// SSEEvent is broadcast to every connected client (e.g. "sentence.created", "sentence.moderated").
type SSEEvent struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// Hub fans out events to all subscribed clients, scoped by book/room ID.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]map[chan SSEEvent]bool // bookID -> set of subscriber channels
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[string]map[chan SSEEvent]bool),
	}
}

var GlobalHub = NewHub()

func (h *Hub) subscribe(bookID string) chan SSEEvent {
	ch := make(chan SSEEvent, 16)
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[bookID] == nil {
		h.clients[bookID] = make(map[chan SSEEvent]bool)
	}
	h.clients[bookID][ch] = true
	return ch
}

func (h *Hub) unsubscribe(bookID string, ch chan SSEEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if subs, ok := h.clients[bookID]; ok {
		delete(subs, ch)
		close(ch)
		if len(subs) == 0 {
			delete(h.clients, bookID)
		}
	}
}

// Broadcast pushes an event to every subscriber of a given book/room.
func (h *Hub) Broadcast(bookID string, event SSEEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.clients[bookID] {
		select {
		case ch <- event:
		default:
			// Drop the event for a slow client rather than blocking the whole hub.
			log.Printf("[sse] dropped event for a slow subscriber on book %s", bookID)
		}
	}
}

// StreamHandler implements GET /api/stream?book_id=...
// Keeps the connection open and flushes newly submitted / moderated sentences.
func StreamHandler(w http.ResponseWriter, r *http.Request) {
	bookID := r.URL.Query().Get("book_id")
	if bookID == "" {
		bookID = "00000000-0000-0000-0000-000000000001" // default global story
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	ch := GlobalHub.subscribe(bookID)
	defer GlobalHub.unsubscribe(bookID, ch)

	// Initial comment to open the stream promptly for the client's EventSource.
	fmt.Fprintf(w, ": connected\n\n")
	flusher.Flush()

	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeat.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		case event, ok := <-ch:
			if !ok {
				return
			}
			payload, err := json.Marshal(event.Data)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, payload)
			flusher.Flush()
		}
	}
}
