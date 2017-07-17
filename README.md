

# requirements

```
sudo apt install build-essential libudev-dev
npm install 
```

`cmd.js`: Run this at root. Detects devices being plugged in and installs them.

`list.js`: Run this as the bionet user. Lists devices that are both installed and plugged in.

# ToDo

## Dymo printers are currently detected but not installed

We need to run something like:

```
sudo lpadmin -p "LabelWriter-450-turbo" -E -v usb://DYMO/LabelWriter%20450%20Turbo?serial=13011612335742 -m lw450t.ppd
```

but in order to do that we need detect the `-m` argument by trying to match the name of the printer to one of the installed drivers as listed by:

```
lpinfo -m
```

## Printers that were already plugged in on boot are not detected

We need to use the `.find` function from the `usb-detection` module.

