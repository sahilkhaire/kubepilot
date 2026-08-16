# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /web/dist ./web/dist
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -o /kubepilot ./cmd/kubepilot

FROM gcr.io/distroless/static-debian12
COPY --from=build /kubepilot /kubepilot
COPY --from=web /web/dist /web/dist
ENV WEB_DIST=/web/dist
USER nonroot:nonroot
ENTRYPOINT ["/kubepilot"]
