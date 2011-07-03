(function() {
  var Inotify, Server, cleanUuid, cli, exec, fs, http, path, socketio;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; }, __slice = Array.prototype.slice;
  http = require("http");
  exec = require('child_process').exec;
  fs = require("fs");
  path = require("path");
  socketio = require("socket.io");
  cli = require("cli");
  Inotify = require('inotify').Inotify;
  cli.parse({
    port: ['p', "Port to listen", "number", 32942],
    host: ['l', "Host to listen", "string", "127.0.0.1"],
    editor: ['c', "Editor to use. {file} will substituted with the file path. Use quotes.", "string", "gedit {file}"]
  });
  cleanUuid = function(uuid) {
    return uuid.replace(/[^a-zA-Z0-9_\-]/g, "");
  };
  Server = (function() {
    function Server(options) {
      this.options = options != null ? options : {};
      this.onFileWrite = __bind(this.onFileWrite, this);;
      this.onDelete = __bind(this.onDelete, this);;
      this.onOpen = __bind(this.onOpen, this);;
      this.onConnection = __bind(this.onConnection, this);;
      this._watchDirectory = __bind(this._watchDirectory, this);;
      this._setupDirectory = __bind(this._setupDirectory, this);;
      this.run = __bind(this.run, this);;
      this.clients = {};
      this.dir = path.join(process.env['HOME'], ".textareaserver");
    }
    Server.prototype.run = function() {
      var app, io;
      this._setupDirectory();
      this._watchDirectory();
      console.log("Starting server...");
      app = http.createServer(function(req, res) {
        res.writeHead(200);
        return res.end('This is your TextareaServer.');
      });
      io = socketio.listen(app, {
        transports: ['websocket']
      });
      io.sockets.on('connection', this.onConnection);
      console.log("Binding to " + this.options.host + ":" + this.options.port);
      return app.listen(this.options.port, this.options.host);
    };
    Server.prototype._setupDirectory = function() {
      var file, stats, _i, _len, _ref, _results;
      try {
        stats = fs.realpathSync(this.dir);
      } catch (error) {
        fs.mkdirSync(this.dir, 0777);
      }
      _ref = fs.readdirSync(this.dir);
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        file = _ref[_i];
        _results.push(fs.unlink(path.join(this.dir, file)));
      }
      return _results;
    };
    Server.prototype._watchDirectory = function() {
      console.log("Start watching directory " + this.dir);
      this.inotify = new Inotify();
      return this.inotify.addWatch({
        path: this.dir,
        watch_for: Inotify.IN_CLOSE_WRITE,
        callback: this.onFileWrite
      });
    };
    Server.prototype.onConnection = function(socket) {
      socket.on('open', __bind(function() {
        var args;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        return this.onOpen.apply(this, [socket].concat(__slice.call(args)));
      }, this));
      socket.on('delete', __bind(function() {
        var args;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        return this.onDelete.apply(this, [socket].concat(__slice.call(args)));
      }, this));
      socket.on('disconnect', this.onDisconnect);
      return null;
    };
    Server.prototype.onOpen = function(socket, msg) {
      var file;
      this.clients[msg.uuid] = socket;
      file = path.join(this.dir, cleanUuid(msg.uuid));
      return fs.writeFile(file, msg.textarea, __bind(function() {
        var cmd, editor, editorCmd, fileRegx;
        if (msg.spawn) {
          fileRegx = /\{ *file *\}/;
          editorCmd = this.options.editor;
          if (!!editorCmd.match(fileRegx)) {
            cmd = editorCmd.replace(fileRegx, file);
          } else {
            cmd = "" + (editorCmd.trim()) + " " + file;
          }
          console.log("Opening editor: " + cmd);
          return editor = exec(cmd);
        }
      }, this));
    };
    Server.prototype.onDelete = function(socket, msg) {
      var uuid, _i, _len, _ref, _results;
      _ref = msg.uuids;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        uuid = _ref[_i];
        delete this.clients[uuid];
        console.log(path.join(this.dir, uuid));
        _results.push(fs.unlink(path.join(this.dir, uuid)));
      }
      return _results;
    };
    Server.prototype.onDisconnect = function() {
      return console.log("browser disconnected");
    };
    Server.prototype.onFileWrite = function(event) {
      var client;
      client = this.clients[event.name];
      if (!client) {
        return;
      }
      return fs.readFile(path.join(this.dir, event.name), function(err, data) {
        var msg;
        msg = {
          textarea: data.toString(),
          uuid: event.name
        };
        return client.send(JSON.stringify(msg));
      });
    };
    return Server;
  })();
  exports.run = function() {
    return cli.main(function(args, options) {
      var server;
      server = new Server(options);
      return server.run();
    });
  };
}).call(this);
