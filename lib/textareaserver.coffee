http     = require("http")
exec     = require('child_process').exec
fs       = require("fs")
path     = require("path")
socketio = require("socket.io")
cli      = require( "cli")
Inotify  = require('inotify').Inotify


# CLI options
cli.parse
  port:   ['p', "Port to listen", "number", 32942 ]
  host:   ['l', "Host to listen", "string", "127.0.0.1"]
  editor: [
    'c',
    "Editor to use. {file} will substituted with the file path. Use quotes.",
    "string", "gedit {file}"
  ]

cleanUuid = (uuid) ->
  # Make sure that there are no funny characters
  uuid.replace(/[^a-zA-Z0-9_\-]/g, "")

class Server

  constructor: (@options = {}) ->
    @clients = {}
    @dir = path.join(process.env['HOME'], ".textareaserver")

  run: =>
    @_setupDirectory()
    @_watchDirectory()

    console.log "Starting server..."

    app = http.createServer (req, res) ->
      res.writeHead(200); res.end('This is your TextareaServer.')

    io = socketio.listen(app, transports: ['websocket'])
    io.sockets.on 'connection', @onConnection

    console.log "Binding to #{@options.host}:#{@options.port}"

    app.listen(@options.port, @options.host)

  # Makes sure that the directory exists and is clean.
  _setupDirectory: =>
    # Create directory if it does not exist yet.
    try
      stats = fs.realpathSync @dir
    catch error
      fs.mkdirSync @dir, 0777

    # Remove all existing files.
    for file in fs.readdirSync @dir
      fs.unlink path.join @dir, file

  # Uses inotify to watch the directory.
  _watchDirectory: =>
    console.log "Start watching directory #{@dir}"

    @inotify = new Inotify()
    @inotify.addWatch
      path: @dir
      watch_for: Inotify.IN_CLOSE_WRITE
      callback: @onFileWrite

  # Called when a client connects.
  onConnection: (socket) =>
    socket.on 'open',   (args...) => @onOpen(socket, args...)
    socket.on 'delete', (args...) => @onDelete(socket, args...)
    socket.on 'disconnect', @onDisconnect

    null

  # Called by the client.
  onOpen: (socket, msg) =>
    @clients[msg.uuid] = socket

    file = path.join @dir, cleanUuid msg.uuid

    fs.writeFile file, msg.textarea, =>
      if msg.spawn

        fileRegx = /\{ *file *\}/
        editorCmd = @options.editor

        if !! editorCmd.match fileRegx
          cmd = editorCmd.replace(fileRegx, file)
        else
          cmd = "#{editorCmd.trim()} #{file}"

        console.log "Opening editor: #{cmd}"

        editor = exec(cmd)

  # Called by the client.
  onDelete: (socket, msg) =>
    for uuid in msg.uuids
      delete @clients[uuid]
      console.log path.join @dir, uuid
      fs.unlink path.join @dir, uuid

  # Called when a socket closes.
  onDisconnect: ->
    console.log "browser disconnected"

  # Called when inotify detects a write.
  onFileWrite: (event) =>
    client = @clients[event.name]

    return unless client

    fs.readFile path.join(@dir, event.name), (err, data) ->
      msg = textarea: data.toString(), uuid: event.name
      client.send JSON.stringify(msg)

exports.run = ->

  cli.main (args, options) ->

    server = new Server(options)
    server.run()
