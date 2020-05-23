
# Requirements

```
sudo apt install build-essential libudev-dev printer-driver-dymo
npm install 
```

# Running

`./bin/cmd.js`: Run this at root. Detects devices being plugged in and installs them.

`./bin/list.js`: Run this as the renegade user. Lists devices that are both installed and plugged in.

# Options

```
--debug: Enable debug output
--fake: Don't actually install anything
--use-usb-uri: Install printers using 'usb:' URIs intead of 'file:' URIs
--no-check-cups: Don't check CUPS config for FileDevice line
--uninstall-all: Uninstall all CUPS printers installed by this program
```

Some DYMO printers have an issue where CUPS detects the same wrong serial number no matter which printer is plugged in. For this reason we default to using `file:` URIs for DYMO printers, but if you want to use `usb:` URIs then you can try the `--use-usb-uri` argument. 

Warning: `--uninstall-all` uses `/dev/printers/` to determine which printers were installed by this program. It assumes the last part of each file name before the `.rules` is the printer's serial number and the first part is the printer's vendor. If you have anything else in this directory that wasn't installed by this program but follows this pattern then it could be removed when running with this argument.

# Setup

TODO installing CUPS and required commands.

CUPS has trouble handling some types of printers. No matter how many are plugged in, CUPS just see them all as one printer and lists the wrong serial number. This has been seen to happen for some people with the DYMO LabelWriter 450. If you know you don't have a problem and really want to use `usb:` URIs for the installed DYMO printers then use the `--use-usb-uri` argument.

Otherwise edit `/etc/cups/cups-files.conf` to enable File device URIs by uncommenting and changing the `FileDevice` line:

```
FileDevice Yes
```

Then restart cups:

```
sudo /etc/init.d/cups restart
```

# Useful CUPS commands

To list all installed printers:

```
lpstat -v
```

List available paper sizes and options:

```
lpoptions -d DYMO-LabelWriter-450-Turbo -l
```

Print with custom paper size:

```
lpr -P DYMO-LabelWriter-450-Turbo -o media=Custom.20x39mm examples/example.png
```

To list all currently connected USB printers (not limited to installed printers):

```
lpinfo -v|grep "usb://"
```

To install a printer do e.g.:

```
sudo lpadmin -p "LabelWriter-450-turbo" -E -v usb://DYMO/LabelWriter%20450%20Turbo?serial=13011612335742 -m lw450t.ppd
```

To list all printer drivers (for the `-m` argument in `lpadmin -p`):

```
lpinfo -m
```


To remove a printer then do e.g:

```
sudo lpadmin -x LabelWriter-450-turbo
```

# Copyright and License

* Copyright 2017-2018 BioBricks Foundation
* Copyright 2020 renegade.bio

License: GPLv3