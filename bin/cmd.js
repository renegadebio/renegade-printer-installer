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
    if(isInstalled) return cb();
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
      
      cb(null, true);
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
      if(lines[i].indexOf(uri) >= 0) {
        return cb(null, true);
      }
    }
    cb(null, false);
  });
}

function cupsFindDriver(model, cb) {

  var r = new RegExp("^([^\s]+)\.ppd.+"+model+"\s*$", 'i');

  // list all installed drivers
  exec("lpinfo -m", {maxBuffer: 1024 * 2000}, function(err, stdout, stderr) {
    if(err) return cb(err + "\n" + stderr);
    var lines = stdout.split(/\r?\n/);
    var i, m, line;
    for(i=0; i < lines.length; i++) {
      line = lines[i].toLowerCase();
      if(m = line.match(r)) {
        return cb(null, m[1]); // m[1] is the driver name
      }
    }
    return cb();
  });
}

function installDymo(uri, model, serial, cb) {
  if(uri.match('"') || model.match('"') || serial.match('"')) {
    return cb(new Error('uri, model or serial of usb device contained a " (double-quotes) character. This would result in badness and could be an attempt at accomplishing something malicious.'));
  }

  isDymoInstalled(uri, function(err, isInstalled) {
    if(err) return cb(err);
    if(isInstalled) return cb();
    
    cupsFindDriver(model, function(err, driverName) {
      if(err) return cb(err);
      if(!driverName) return cb(new Error("No driver found for printer:", model, uri));
      var printerName = model.replace(/\s+/g, '-') + '-' + serial;

      exec('lpadmin -p "'+printerName+'" -E -v "'+uri+'" -m "'+driverName+'.ppd"', function(err, stdout, stderr) {
        if(err) return cb(err + "\n" + stderr);
        cb(null, true);
      }); 
    });
  });
}


// vendor is "brother" or "dymo"
function installPrinter(vendor, model, serial, cb) {
  vendor = vendor.toLowerCase();
  model = model.replace(/_/g, ' ');

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
          return installDymo(m[0], model, serial, cb);
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


function onDetectPrinter(device, cb) {
  if(!isDeviceSupported(device)) {
    if(cb) cb();
    return;
  }
  
  installPrinter(device.manufacturer, device.deviceName, device.serialNumber, function(err, installed) {
    if(err) {
      console.error("Installing printer failed:", device, "\n", err);
      if(cb) cb();
      return;
    }
    if(installed) {
      console.log("Successfully installed printer:", device);
    } else {
      console.log("Printer was already installed:", device);
    }
    if(cb) cb();
  });
}

function init() {
  if(process.geteuid() !== 0) {
    console.error("You must run this program as root");
    console.error("since it needs to modify /etc/udev/rules.d/");
    console.error("and run `udevadm trigger` as root");
    usbDetect.stopMonitoring();
    process.exit(1);
  }

  console.log("Checking for already connected printers")

  // detect USB devices that are already connected
  usbDetect.find(function(err, devices) { 
    if(err) return console.error("Error finding usb devices:", err);

    async.eachSeries(devices, onDetectPrinter, function() {

      console.log("Waiting for new printers to be plugged in.");

      // detect new USB devices as they are plugged in
      usbDetect.on('add', onDetectPrinter);
    });
  });

}

init();


