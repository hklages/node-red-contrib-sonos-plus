
module.exports = function (RED) {
  'use strict';

  function SonosPlayerNode (config) {
    RED.nodes.createNode(this, config);

    this.serialnum = config.serialnum;
    this.ipaddress = config.ipaddress;
  }

  // Build API to auto detect IP Addresses
  RED.httpAdmin.get('/sonosSearch', function (req, res) {
    discoverSonos(function (devices) {
      res.json(devices);
    });
  });
  var node = this;
  function discoverSonos (discoveryCallback) {
    const sonos = require('sonos');

    var devices = []; // list of all discovered devices

    // define discovery and store outcome in devices
    var search = sonos.DeviceDiscovery(function (device) {
      device.deviceDescription()
        .then(data => {
          devices.push({
            label: data.friendlyName + ' in room ' + data.roomName,
            value: data.serialNum
          });
          node.log('Found device ' + data.serialNum);
        })
        .catch(err => {
          node.error('DeviceDiscovery error! ' + 'Details: ' + JSON.stringify(err));
        });
    });

    search.setMaxListeners(Infinity);

    // destroy after 5 seconds
    setTimeout(function () {
      search.destroy();
    }, 5000);

    // Add a bit of delay and return the list of all discovered devices
    if (discoveryCallback) {
      setTimeout(function () {
        discoveryCallback(devices);
      }, 5000);
    }
  }

  RED.nodes.registerType('sonos-config', SonosPlayerNode);
};
