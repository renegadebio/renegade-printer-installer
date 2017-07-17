#!/usr/bin/env node

// list active printers (installed, connected and turned on)

var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;

var devPath = '/dev/bionet';


function listDev(cb) {
  fs.readdir(devPath, function(err, files) {
    if(err) return cb(err);

    cb(null, files.map(function(file) {
      return path.join(devPath, file);
    }));
  });
}

function installedCUPS(cb) {

  // list all installed printers
  exec("lpstat -v", function(err, stdout, stderr) {
    if(err) return cb(err + "\n" + stderr);  
    
    var lines = stdout.split(/\r?\n/);
    var devices = [];

    var i, m;
    for(i=0; i < lines.length; i++) {
      m = lines[i].match(/device\s+for\s+([^:+]+):\s+([^\s]+)/i);
      if(!m) continue;

      devices.push({
        name: m[1],
        uri: m[2]
      });
    }


    cb(null, devices);
  });
}

function listCUPS(cb) {
  
  var list = [];

  installedCUPS(function(err, installed) {
    if(err) return cb(err);

    // list all connected printers
    exec("lpinfo -v", function(err, stdout, stderr) {
      if(err) return cb(err + "\n" + stderr);
      
      var lines = stdout.split(/\r?\n/);
      var i, j, line, m, uriString;
      for(i=0; i < lines.length; i++) {
        line = lines[i];

        m = line.match(/usb:\/\/[^\s]+/i)
        if(!m) continue
        uriString = m[0];

        for(j=0; j < installed.length; j++) {
          if(installed[j].uri === m[0]) {
            list.push(installed[j].uri);
          }
        }
        cb(null, list);
      }
    });
  });
}


function list() {
  listDev(function(err, devices) {
    if(err) {
      console.error(err);
      process.exit(1);
    }

    console.log(devices);

    listCUPS(function(err, devices) {
      if(err) {
        console.error(err);
        process.exit(1);
      }

      console.log(devices);

    });
  });
}




list();
