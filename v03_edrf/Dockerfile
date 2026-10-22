# The recordings of the original played back first: the build fails if the
# game doesn't go as it did there.
FROM node:24-alpine AS test-js
WORKDIR /src
COPY web web
COPY tests tests
RUN node tests/drf.mjs | tee /drf-tests.txt

FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
COPY web web
RUN go vet ./... && go test ./... && CGO_ENABLED=0 go build -o /digger .

FROM alpine:3.20
COPY --from=test-js /drf-tests.txt /
COPY --from=build /digger /usr/local/bin/digger
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["digger", "-scores", "/data/scores.json"]
