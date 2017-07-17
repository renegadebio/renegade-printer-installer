#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;
var async = require('async');
var userid = require('userid');
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
    
    console.log("Installed");

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

// check if the bionet udev rule exists and is writable
function checkUdevPermissions() {

  try {
    fs.accessSync(udevDir, fs.constants.X_OK | fs.constants.R_OK | fs.constants.W_OK);
    var stats = fs.statSync(udevDir);

    if(!stats.isDirectory()) {
      console.error("The udev rule directory exists but is not a directory!");
      console.error("Something is very odd about your system and I have no idea how to proceed.");
      console.error("");
      return false;
    }

  } catch(err) {

    console.error("I need access to the udev rules directory /dev/udev/rules.d/");
    console.error("in order to add rules for new printers as they are plugged in for the first time.");
    console.error("To grant me access run this:");
    console.error("  sudo chgrp " + userid.groupname(process.getegid()) + " " + udevDir);
    console.error("  sudo chmod 775 " + udevDir);
    console.error("");
    return false;
  }
  
  return true;
  
}

function isDeviceSupported(device) {
  if(supportedDevices[device.manufacturer.toLowerCase()]) {

    // TODO implement matching the model
    return true;
  }

  return false;
}


function init() {
  if(!checkUdevPermissions()) {
    usbDetect.stopMonitoring();
    process.exit(1);
    return;
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
