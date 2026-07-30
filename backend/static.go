package main

import (
	"embed"
	"io/fs"
	"log"
)

// The Next.js static export must be built into backend/out before `go build`:
//
//	cd frontend && npm run build   (with next.config.js output: 'export')
//	cp -r frontend/out backend/out
//
//go:embed all:out
var embeddedFrontend embed.FS

// FrontendFS strips the "out" prefix so paths resolve as if "out" were the web root.
func FrontendFS() fs.FS {
	sub, err := fs.Sub(embeddedFrontend, "out")
	if err != nil {
		log.Fatalf("failed to create sub filesystem for embedded frontend: %v", err)
	}
	return sub
}
