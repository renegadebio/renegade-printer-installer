#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;
var async = require('async');
var usbDetect = require('usb-detection');

var udevDir = "/etc/udev/rules.d";

var vendorIDs = {
  brother: "04f9",
  dymo: "?"
};

var supportedDevices = {
  brother: {

  },
  dymo: {

  }
}

function udevCheckLine(line, vendor, serial) {
  if(!line.match('ATTRS{idVendor}=="'+vendorIDs[vendor]+'"')) {
    return false;
  }

  if(!line.match('ATTRS{serial}=="'+serial+'"')) {
    return false;
  }

  return true;
}

function isBrotherInstalled(vendor, serial, cb) {
  fs.readdir(udevDir, function(err, files) {
    if(err) return cb(err);
    async.eachSeries(files, function(file, next) {
      if(!file.match(/^bionet-.+\.rules$/)) return next();
      
      fs.readFile(path.join(udevDir, file), {encoding: 'utf8'}, function(err, data) {
        if(err) return cb(err);
        
        var lines = data.split(/\r?\n/);
        var i, m;
        
        for(i=0; i < lines.length; i++) {
          if(udevCheckLine(lines[i], vendor, serial)) {
            return cb(null, true);
          }
        }
        next();

      });
    }, cb);
  });
}


// ATTRS{idVendor}=="04f9", ATTRS{serial}=="B3Z595204", SYMLINK+="bionet/brother-B3Z595204"

function installBrother(vendor, serial, cb) {
  isBrotherInstalled(vendor, serial, function(err, isInstalled) {
    if(err) return cb(err);
    if(isInstalled) return cb(new Error("Already installed"));
  });

  var elements = [];

  elements.push('ATTRS{idVendor}=="'+vendorIDs[vendor]+'"');
  elements.push('ATTRS{serial}=="'+serial+'"');
  elements.push('SYMLINK+="bionet/brother-'+serial+'"');

  var line = "\n"+elements.join(", ")+"\n";
  
  fs.writeFile(path.join(udevDir, 'bionet-brother-'+serial+'.rules'), line, {encoding: 'utf8'}, function(err) {
    if(err) return cb(err);

    // let udev know we updated things
    exec("udevadm trigger ", function(err, stdout, stderr) {
      if(err) return cb(err + "\n" + stderr);  
      
      cb();
    });
  });
}

function isDymoInstalled(uri, cb) {

  // list all installed printers
  exec("lpstat -v", function(err, stdout, stderr) {
    if(err) return cb(err + "\n" + stderr);  
    
    var lines = stdout.split(/\r?\n/);
    var i, m;
    for(i=0; i < lines.length; i++) {
      if(lines[i].match(uri)) {
        return cb(null, true);
      }
    }
    cb(null, false);
  });
}

function installDymo(uri, cb) {
  isDymoInstalled(uri, function(err, isInstalled) {
    if(err) return cb(err);
    if(isInstalled) return cb(new Error("Already installed"));
    
    throw new Error("NOT IMPLEMENTED!")

  });
}


// vendor is "brother" or "dymo"
function installPrinter(vendor, serial, cb) {
  vendor = vendor.toLowerCase();

  console.log(vendor, serial);
  var r = new RegExp("usb://"+vendor+".+serial="+serial, 'i')
  
  // list all connected printers
  exec("lpinfo -v", function(err, stdout, stderr) {
    if(err) return cb(err + "\n" + stderr);
    var lines = stdout.split(/\r?\n/);
    var i, m;
    for(i=0; i < lines.length; i++) {
      if(m = lines[i].match(r)) {
        if(vendor === 'brother') {
          return installBrother(vendor, serial, cb);
        } else {
          return installDymo(m[0], cb);
        }
      }
    }
  });
}

function isDeviceSupported(device) {
  if(supportedDevices[device.manufacturer.toLowerCase()]) {

    // TODO implement matching the model
    return true;
  }

  return false;
}


function init() {
  if(process.geteuid() !== 0) {
    console.error("You must run this program as root");
    console.error("since it needs to modify /etc/udev/rules.d/");
    console.error("and run `udevadm trigger` as root");
    usbDetect.stopMonitoring();
    process.exit(1);
  }

  console.log("Waiting for new printers to be plugged in.");

  // Detect add/insert
  usbDetect.on('add', function(device) {
    if(!isDeviceSupported(device)) return;


    installPrinter(device.manufacturer, device.serialNumber, function(err) {
      if(err) {
        console.error("Installing printer failed:", device, "\n", err);
        return;
      }
      console.log("Installed printer:", device);
    });
    
  });
}

init();


