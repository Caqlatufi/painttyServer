var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
// var heapdump = require('heapdump');
var agent = require('webkit-devtools-agent');
var _ = require('underscore');
var domain = require('domain');
var toobusy = require('toobusy');
var async = require('async');
var mongoose = require('mongoose');
var common = require('./common.js');
var RoomManager = require('./roommanager.js');
var logger = common.logger;
var globalConf = common.globalConf;
// var express = require('express');
// var httpServer = express();

if (cluster.isMaster) {
  process.title = 'painttyServer master';
  async.auto({
    'init_db': function(callback) {
      mongoose.connect(globalConf['database']['connectionString']);
      var db = mongoose.connection;
      db.on('error', function(er) {
        logger.error('connection error:', er);
        callback(er);
      });
      db.once('open', function () {
        callback();
      });
    },
    'fork_child': ['init_db', function(callback){
      // Fork workers.
      function forkWorker(memberId) {
        var worker = cluster.fork({'memberId': memberId});
        worker.memberId = memberId;
        worker.on('message', function(msg) {
          _.each(cluster.workers, function(ele, index, list) {
                ele.send(msg);
          });
        });
      }

      for (var i = 0; i < numCPUs; i++) {
        forkWorker(i);
      }

      cluster.on('exit', function(worker, code, signal) {
        if (!worker.process) {
          logger.error('worker destroyed before exit event handled');
        }else{
          logger.error('worker ', worker.process.pid, ' died');
        }
        
        if(worker.memberId){
          logger.warn('Worker with memberId', worker.memberId, 'died');
          forkWorker(worker.memberId);
        }else{
          logger.error('Worker died without memberId');
        }
      });

      callback();
    }]
  }, function(er, re){
    if (er) {
      logger.error('Error while init master process: ', er);
    };
  });
  
} else {
  var d1 = domain.create();
  var roomManager;
  d1.run(function() {
    var memberId = 0;
    if (process.env['memberId']) {
      memberId = parseInt(process.env['memberId'], 10);
    }else{
      logger.error('Worker process inited without memberId!');
    }

    process.title = 'painttyServer child, memberId:' + memberId;

    roomManager = new RoomManager({
      localId: memberId, 
      name: 'rmmgr', 
      pubPort: globalConf['manager']['publicPort']
    });
    roomManager.on('ready', function() {
      roomManager.start();
    });

    process.on('SIGINT', function() {
      if (roomManager) {
        roomManager.stop();
      };
      toobusy.shutdown();
      process.exit();
    });

  });
  d1.on('error', function(er1) {
    logger.error('Error with RoomManager:', er1);
    try {
      // make sure we close down within 30 seconds
      var killtimer = setTimeout(function() {
        process.exit(1);
      }, 30000);
      // But don't keep the process open just for that!
      killtimer.unref();

      if (roomManager) {
        var error_notify = '<p style="font-weight:bold;color:red;">完蛋了！！'+
                  '检测到服务端发生了一些故障，赶快逃离吧！！。</p>\n';
        roomManager.localcast(error_notify);
        roomManager.stop();
      };
    } catch(er) {
      logger.error('Cannot gently close RoomManager:', err);
      toobusy.shutdown();
      process.exit(1);
    }
  });
}


// httpServer.get('/', function(req, res) {
    // var list = [];
    // _.each(roomManager.roomObjs, function(item) {
        // if(_.isUndefined(item)) return;
        // var r = {
            // cmdport: item.cmdSocket.address().port,
            // // serveraddress: roomManager.pubServer.address().address,
            // maxload: item.options.maxLoad,
            // currentload: item.currentLoad(),
            // name: item.options.name,
            // 'private': item.options.password.length > 0
        // };
        // list.push(r);
    // });
    // list.push(roomManager.pubServer.address());
    // var m = JSON.stringify(list);
    // res.send('<h2>Hello from Mr.Paint</h2><p>Here is some debug info: </p>'+m);
// });

// httpServer.listen(39797);
