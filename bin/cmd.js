#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var doExec = require('child_process').exec;
var async = require('async');
var usbDetect = require('usb-detection');
var minimist = require('minimist');

var UDEV_DIR = "/etc/udev/rules.d";

const argv = minimist(process.argv.slice(2), {
  alias: {
    d: 'debug' // enable debug mode
    
  },
  boolean: [
    'debug',
    'use-usb-uri', // install printers using file: URIs
    'uninstall-all'
  ]
});

var CUPS_FILES_CONFIG_PATH = '/etc/cups/cups-files.conf';
var DEV_SUBDIR = 'printers';
var DEV_DIR = path.join('/dev', DEV_SUBDIR);

var supportedDevices = {
  brother: [

  ],
  dymo: [
    0x0922
  ]
}

function debug() {
  if(!argv.debug) return;
  var args = Array.prototype.splice.call(arguments, 0);
  args = ['[debug]'].concat(args);

  console.log.apply(null, args);
}

function exec(cmd, opts, cb) {
  if(typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  if(argv.fake) {
    debug("--fake enabled so not actually running command:", cmd);
  } else {
    debug("Running command:", cmd);
  }
  doExec(cmd, opts, cb);
}

function uninstallAll() {
  console.log("TODO not fully implemented");
  
  fs.readdir(UDEV_DIR, function(err, files) {
    if(err) return cb(err);
    async.eachSeries(files, function(file, next) {

      next();
    });
  });
}

function vendorIDToHex(vendorID) {
  if(typeof vendorID === 'string') {
    vendorID = parseInt(vendorID);
  }
  var str = vendorID.toString(16);
  
  var zeroes = 4 - str.length;
  var i;
  for(i=0; i < zeroes; i++) {
    str = '0' + str;
  }
  return str;
}

function udevCheckLine(line, vendorID, serial) {
  if(!line || !line.trim()) return false;

  var hexVendorID = vendorIDToHex(vendorID);
  
  debug("Checking for vendorID", hexVendorID, "and serial", serial, "on line:");
  debug("  " + line);
  if(!line.match('ATTRS{idVendor}=="'+hexVendorID+'"')) {
    return false;
  }

  if(!line.match('ATTRS{serial}=="'+serial+'"')) {
    return false;
  }

  debug("  FOUND!");
  return true;
}

function isUdevInstalled(vendor, vendorID, serial, cb) {
  var rulesRegexp = new RegExp("^"+vendor+"-.+\.rules$");
  
  fs.readdir(UDEV_DIR, function(err, files) {
    if(err) return cb(err);
    async.eachSeries(files, function(file, next) {
      if(!file.match(rulesRegexp)) return next();
      
      fs.readFile(path.join(UDEV_DIR, file), {encoding: 'utf8'}, function(err, data) {
        if(err) return cb(err);
        
        var lines = data.split(/\r?\n/);
        var i, m;
        
        for(i=0; i < lines.length; i++) {

          if(udevCheckLine(lines[i], vendorID, serial)) {
            return cb(null, true);
          }
        }
        next();

      });
    }, cb);
  });
}

function installUdevRule(vendor, vendorID, serial, cb) {

  var elements = [];

  var vendorIDHex = vendorIDToHex(vendorID);
  
  elements.push('SUBSYSTEM=="usbmisc"');
  elements.push('ATTRS{idVendor}=="'+vendorIDHex+'"');
  elements.push('ATTRS{serial}=="'+serial+'"');
  elements.push('SYMLINK+="'+getUdevPath(vendor, serial)+'"');

  var line = elements.join(", ")+"\n";

  var fileToWrite = path.join(UDEV_DIR, vendor+'-'+serial+'.rules');

  debug("Writing udev rule to", fileToWrite);
  debug("  rule:", line);

  if(argv.fake) {
    debug("  --fake enabled so not actually writing");
    return cb(null, true);
  }
  
  fs.writeFile(fileToWrite, "\n"+line, {encoding: 'utf8'}, function(err) {
    if(err) return cb(err);

    // let udev know we updated things
    exec("udevadm trigger ", function(err, stdout, stderr) {
      if(err) return cb(err + "\n" + stderr);  
      
      cb(null, true);
    });
  });
}

function installBrother(vendor, vendorID, serial, cb) {
  isUdevInstalled(vendor, vendorID, serial, function(err, isInstalled) {
    if(err) return cb(err);
    if(isInstalled) return cb();
  });

  installUdevRule(vendor, vendorID, serial, cb);
}

function uriType(uri) {
  var m = uri.match(/^(file|usb):/);
  if(!m) throw new Error("Unknown URI type: " + uri);

  return m[1];
}

function isCupsInstalled(uri, vendor, vendorID, serial, cb) {

  if(uriType(uri) === 'file') {
    
    isUdevInstalled(vendor, vendorID, serial, cb);
    return;
    
  } else {
    
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
    return;
  }
}

function checkFileDevice(cb) {
  cb = cb || function(){};
  if(argv['use-usb-uri']) {
    return;
  }

  debug("Checking if the 'FileDevice' option is enabled in:", CUPS_FILES_CONFIG_PATH);
  
  fs.readFile(CUPS_FILES_CONFIG_PATH, {encoding: 'utf8'}, function(err, data) {
    if(err) {
      console.log("WARNING: Could not read", CUPS_FILES_CONFIG_PATH);
      console.log("  which makes it impossible to determine if the 'FileDevice'");
      console.log("  option is enabled for CUPS. If you are using CUPS printers");
      console.log("  then please ensure that this option is enabled");
      return cb();
    }

    var lines = data.split(/\r?\n/);
    var i, line;
    for(i=0; i < lines.length; i++) {
      line = lines[i];
      if(line.match(/^\s*#/)) continue;
      if(line.match(/^\s*FileDevice\s*Yes/)) {
        debug("FileDevice option is enabled!");
        return cb(null, true);
      }
    }

    console.log("WARNING: It looks like the 'FileDevice' option is not enabled in:", CUPS_FILES_CONFIG_PATH);
    console.log("  If you are using any CUPS printers then please see");
    console.log("  the README.md file for how to enable this option.");
    
    return cb(null, false);
  });
}

function cupsFindDriver(model, cb) {
  var modelReg = model.replace(/\s+/g, "\\s+");
  var r = new RegExp("^([^\\s]+)\.ppd.+"+modelReg+"\\s*$", 'i');

  var cmd = "lpinfo -m";

  debug("Listing all installable printer drivers using:", cmd);
  debug("while looking for a match to:", modelReg);
  debug("(please stand by, this can take a while)");
  
  // list all installed drivers
  exec(cmd, {maxBuffer: 1024 * 2000}, function(err, stdout, stderr) {
    if(err) return cb(err + "\n" + stderr);
    var lines = stdout.split(/\r?\n/);
    var i, m, line;
    for(i=0; i < lines.length; i++) {
      line = lines[i];

      if(m = line.match(r)) {
        debug("  Found:", m[0]);
        return cb(null, m[1]); // m[1] is the driver name
      }
    }
    return cb();
  });
}

function activateCupsPrinter(printerName, cb) {

  var cmd = 'sudo cupsenable "'+printerName+'"';
    
  exec(cmd, function(err, stdout, stderr) {
    if(err) cb(err);
    
    cmd = 'sudo cupsaccept "'+printerName+'"';
    
    exec(cmd, cb);
  });
}

function installCups(vendor, vendorID, model, serial, cb) {
  if(vendor.match('"') || model.match('"') || serial.match('"')) {
    return cb(new Error('vendor, model or serial of usb device contained a " (double-quotes) character. This would result in badness and could be an attempt at accomplishing something malicious.'));
  }

  getURI(vendor, serial, function(err, uri) {
    if(err) return cb(err);

    debug("Device URI:", uri);
    
    isCupsInstalled(uri, vendor, vendorID, serial, function(err, isInstalled) {
      if(err) return cb(err);
      
      debug("Is device already installed:", (isInstalled) ? "Yes" : "No");
      
      if(isInstalled) return cb();
      
      cupsFindDriver(model, function(err, driverName) {
        if(err) return cb(err);
        if(!driverName) return cb(new Error("No driver found for printer:", model, uri));

        installUdevRule(vendor, vendorID, serial, function(err) {
        
          var printerName = model.replace(/\s+/g, '-') + '-' + serial;

          var cmd = 'lpadmin -p "'+printerName+'" -E -v "'+uri+'" -m "'+driverName+'.ppd"';
          
          exec(cmd, function(err, stdout, stderr) {
            if(err) return cb(err + "\n" + stderr);

            activateCupsPrinter(printerName, function(err) {
              cb(null, true);
            });
          });
        });
      });
    });
  });
}

function getUdevPath(vendor, serial) {
  return path.join(DEV_SUBDIR, vendor+'-'+serial);
}

function getFileURI(vendor, serial, cb) {
  var uri = 'file:'+path.join('/dev', getUdevPath(vendor, serial));
  
  cb(null, uri);
}

function getUsbURI(vendor, serial, cb) {
  var r = new RegExp("usb://"+vendor+".+serial="+serial, 'i')

  // list all connected printers
  exec("lpinfo -v", function(err, stdout, stderr) {
    if(err) return cb(err + "\n" + stderr);
    var lines = stdout.split(/\r?\n/);
    var i, m, uri;
    for(i=0; i < lines.length; i++) {
      if(m = lines[i].match(r)) {
        uri = m[0];
        return cb(null, uri);
      }
    }
    return cb(new Error("Printer with vendor '"+vendor+"' and serial '"+serial+"' not detected by CUPS. Maybe don't use the --use-usb-uri argument"));
  });

}

function getURI(vendor, serial, cb) {

  if(argv['use-usb-uri']) {
    return getUsbURI(vendor, serial, cb);
  } else {
    return getFileURI(vendor, serial, cb);
  }
}

// vendor is "brother" or "dymo"
function installPrinter(vendor, vendorID, model, serial, cb) {
  vendor = vendor.toLowerCase();
  model = model.replace(/_/g, ' ');

//  console.log("VENDOR:", vendor, "||", model, "||", serial);
  
  if(vendor === 'brother') {
    return installBrother(vendor, vendorID, serial, cb);
  } else if(vendor === 'dymo') {
    return installCups(vendor, vendorID, model, serial, cb);
  } else {
    return cb(new Error("Printer from unsupported vendor '"+vendor+"'"));
  }
}

function oneLineDevice(device) {
  if(!device.manufacturer) {
    return 'Vendor ID: ' + device.vendorId + ', Product ID: ' + device.vendorId;
  }
  var str = device.manufacturer + ': ' + device.deviceName;
  if(device.serialNumber) {
    str += ' with serial: ' + device.serialNumber;
  }
  return str;
}

function isDeviceSupported(device) {
  debug("Checking if device is supported: ", oneLineDevice(device));
  var manufacturer = supportedDevices[device.manufacturer.toLowerCase()];
  if(!manufacturer) {
    return false;
  }

  if(manufacturer.indexOf(device.vendorId) < 0) {
    return false
  }
  return true;
}


function onDetectPrinter(device, cb) {
  if(!isDeviceSupported(device)) {
    if(cb) cb();
    return;
  }
  console.log("Detected supported printer:", device);
  
  installPrinter(device.manufacturer, device.vendorId, device.deviceName, device.serialNumber, function(err, installed) {
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
    console.error("You must run this program as root since it needs to modify /etc/udev/rules.d/");
    console.error("and needs to run `udevadm trigger` as root");
    usbDetect.stopMonitoring();
    process.exit(1);
  }
  
  if(argv['uninstall-all']) {
    uninstallAll(function(err, number) {
      if(err) {
        console.error(e);
        process.exit(1);
      }
      console.log("Uninstalled:", number, "printers");
      process.exit(0);
    });
    return;
  }
  
  console.log("Checking for already connected printers")

  // detect USB devices that are already connected
  usbDetect.find(function(err, devices) { 
    if(err) return console.error("Error finding usb devices:", err);

    async.eachSeries(devices, onDetectPrinter, function() {

      console.log("Waiting for new printers to be plugged in.");

      // detect new USB devices as they are plugged in
      usbDetect.startMonitoring();
      usbDetect.on('add', onDetectPrinter);
      
    });
  });

}


checkFileDevice(function(err, isFileDeviceOptionEnabled) {
  init();
});



