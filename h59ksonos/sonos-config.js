
module.exports = function (RED) {
  'use strict';

  function SonosPlayerNode (config) {
    RED.nodes.createNode(this, config);

    this.serialnum = config.serialnum;
    this.ipaddress = config.ipaddress;
  }

  // Build API to auto detect IP Addresses
  RED.httpAdmin.get('/sonosSearch', function (req, res) {
    RED.log.debug('GET /sonosSearch');
    discoverSonos(function (devices) {
      RED.log.debug('GET /sonosSearch: ' + devices.length + ' found');
      res.json(devices);
    });
  });

  function discoverSonos (discoveryCallback) {
    RED.log.debug('Start Sonos discovery');

    //  const sonos = require('sonos');
    const sonos = require('sonos');
    var devices = [];

    var search = sonos.DeviceDiscovery(function (device) {
      device.deviceDescription().then(data => {
        devices.push({
          label: data.friendlyName + ' in room ' + data.roomName,
          value: data.serialNum
        });
      }).catch(err => {
        console.log('Error occurred %j', err);
      });
    });

    search.setMaxListeners(Infinity);

    // Stop searching after 5 seconds
    setTimeout(function () {
      search.destroy();
    }, 5000);

    // Add a bit of delay for all devices to be discovered
    if (discoveryCallback) {
      setTimeout(function () {
        discoveryCallback(devices);
      }, 5000);
    }
  }

  RED.nodes.registerType('sonos-config', SonosPlayerNode);
};
