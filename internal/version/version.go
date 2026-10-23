// Package version holds the build version, set at link time:
//
//	go build -ldflags "-X github.com/sahilkhaire/kubepilot/internal/version.Version=v0.2.0"
package version

// Version is the release tag (or commit) the binary was built from. "dev" for local builds.
var Version = "dev"
