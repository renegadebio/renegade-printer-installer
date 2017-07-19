
# requirements

```
sudo apt install build-essential libudev-dev
npm install 
```

`./bin/cmd.js`: Run this at root. Detects devices being plugged in and installs them.

`./bin/list.js`: Run this as the bionet user. Lists devices that are both installed and plugged in.

# ToDo

* Integrate this into bionet labdevice daemon

# Useful CUPS commands

To list all installed printers:

```
lpstat -v
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

Copyright 2017 BioBricks Foundation

License: Dual-licensed under GPLv3 and AGPLv3. You may use this software under the terms of either or both as you prefer.