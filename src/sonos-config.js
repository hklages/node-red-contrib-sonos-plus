
module.exports = function (RED) {
  'use strict';

  let node = {}; // used for sending node.error, node.debug

  function SonosPlayerNode (config) {
    RED.nodes.createNode(this, config);

    node = this;
    node.serialnum = config.serialnum;
    node.ipaddress = config.ipaddress;
  }

  // Build API to auto detect IP Addresses
  RED.httpAdmin.get('/sonosSearch', function (req, response) {
    discoverSonosPlayer(function (playerList) {
      response.json(playerList);
    });
  });

  function discoverSonosPlayer (discoveryCallback) {
    const sonos = require('sonos');

    const playerList = []; // list of all discovered SONOS players

    if (!discoveryCallback) {
      node.error('No callback defined in discoverSonosPlayer');
      return;
    }

    // define discovery and store in devices
    const searchTime = 4000; // in miliseconds
    node.debug('Start searching for players');
    const search = sonos.DeviceDiscovery({ timeout: searchTime });

    // listener for DeviceDiscovery
    search.on('DeviceAvailable', (sonosPlayer, model) => {
      sonosPlayer.deviceDescription()
        .then(data => {
          playerList.push({
            label: data.friendlyName + '::' + data.roomName,
            value: data.serialNum
          });
          node.debug('Found SONOS player ' + data.serialNum);
        })
        .catch(err => {
          node.error('DeviceDiscovery error:: Details: ' + JSON.stringify(err));
        });
    });

    // after timeout return values
    setTimeout(() => {
      node.debug('Returning results from search');
      discoveryCallback(playerList);
    }, searchTime + 10);
  }

  RED.nodes.registerType('sonos-config', SonosPlayerNode);
};
