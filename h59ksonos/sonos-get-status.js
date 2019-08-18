var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosGetStatusNode (config) {
    /**  Create Get Status Node and subscribe to messages
    * @param  {object} config current node configuration data
    */

    RED.nodes.createNode(this, config);

    // verify config node. if valid then set status and process message
    var node = this;
    var configNode = RED.nodes.getNode(config.confignode);
    var isValid = helper.validateConfigNodeV2(configNode);
    if (isValid) {
      // clear node status
      node.status({});

      // handle input message (the different requests are chained)
      node.on('input', function (msg) {
        node.log('SONOS_PLUS::Info::' + 'input received');
        // TODO get sonosPlayer and handover instead of ipAddress
        helper.identifyPlayerProcessInputMsg(node, configNode, msg, function (ipAddress) {
          if (ipAddress === null) {
            // error handling node status, node error is done in identifyPlayerProcessInputMsg
            node.log('SONOS_PLUS::Info::' + 'Could not find any sonos player!');
          } else {
            node.log('SONOS_PLUS::Info::' + 'Found sonos player and continue!');
            getSonosCurrentState(node, msg, ipAddress);
          }
        });
      });
    }
  }

  // ------------------------------------------------------------------------------------------

  function getSonosCurrentState (node, msg, ipaddress) {
    /**  Validate sonos player and input message then get state and all other data.
    * @param  {Object} node current node
    * @param  {object} msg incoming message
    * @param  {string} ipaddress IP address of sonos player
    */
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);

    if (sonosPlayer === null || sonosPlayer === undefined) {
      node.status({ fill: 'red', shape: 'dot', text: 'sonos player is null' });
      node.error('SONOS-PLUS::Error::' + 'Sonos player is null. Check configuration.');
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (!(msg.payload !== null && msg.payload !== undefined && msg.payload)) {
      node.status({ fill: 'red', shape: 'dot', text: 'invalid payload.' });
      node.error('SONOS-PLUS::Error::' + 'Invalid payload.');
      return;
    }
    var command = msg.payload;
    command = '' + command;// convert to string
    command = command.toLowerCase();
    msg.command = command;

    // execute first api to get state
    sonosPlayer.getCurrentState().then(state => {
      if (state === null || state === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid current state retrieved' });
        node.error('SONOS-PLUS::Error::' + 'get state. ' + 'Details: ' + 'invalid response from player.');
        return;
      }
      msg.state = state;
      if (command === 'state_only') {
        node.status({ fill: 'green', shape: 'dot', text: 'OK got state ' });
        node.log('SONOS_PLUS::Info::' + 'got valid state.');
        node.send(msg);
      } else {
        node.log('SONOS_PLUS::Info::' + 'Continue to get other info.');
        getSonosVolume(node, msg, sonosPlayer);
      }
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve current state' });
      node.error('SONOS-PLUS::Error::' + 'Could not get current state.' + 'Details:' + JSON.stringify(err));
    });
  }

  function getSonosVolume (node, msg, sonosPlayer) {
    /**  get sonos volume for selected player and continue in chain
    * @param  {Object} node current node
    * @param  {Object} msg incoming message
    * @param  {Object} sonosPlayer SONOS player object
    */

    sonosPlayer.getVolume().then(volume => {
      if (volume === null || volume === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid volume retrieved' });
        node.error('SONOS-PLUS::Error::' + 'get volume. ' + 'Details: ' + 'invalid response from player.');
        return;
      }
      if (volume < 0 || volume > 100) {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid volume range retrieved' });
        node.error('SONOS-PLUS::Error::' + 'get volume. ' + 'Details: ' + 'volume out of range [0..100].');
        return;
      }
      // Output data
      msg.volume = volume;
      msg.normalized_volume = volume / 100.0;
      node.log('SONOS_PLUS::Info::' + 'got valid volume and continue');
      getSonosMuted(node, msg, sonosPlayer);
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve volume.' });
      node.error('SONOS-PLUS::Error::' + 'Could not get current volume.' + 'Details:' + JSON.stringify(err));
    });
  }

  function getSonosMuted (node, msg, sonosPlayer) {
    sonosPlayer.getMuted().then(muted => {
      if (muted === null || muted === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid mute value retrieved' });
        node.error('SONOS-PLUS::Error::' + 'get mute. ' + 'Details: ' + 'invalid mute response from player.');
        return;
      }

      // Output data
      node.log('SONOS_PLUS::Info::' + 'got valid mute value and continue');
      msg.muted = muted;
      getSonosName(node, msg, sonosPlayer);
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve Mute status' });
      node.error('SONOS-PLUS::Error::' + 'Could not get mute state.' + 'Details:' + JSON.stringify(err));
    });
  }

  function getSonosName (node, msg, sonosPlayer) {
    sonosPlayer.getName().then(name => {
      // Output data
      node.log('SONOS_PLUS::Info::' + 'got valid mute value and continue');
      msg.sonosName = name;
      getSonosCurrentTrack(node, msg, sonosPlayer);
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve name' });
      node.error('SONOS-PLUS::Error::' + 'Could not get name.' + 'Details:' + JSON.stringify(err));
    });
  }

  function getSonosCurrentTrack (node, msg, sonosPlayer) {
    var artist = 'unknown';
    var title = 'unknown';
    sonosPlayer.currentTrack().then(trackObj => {
      if (trackObj === null || trackObj === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid current track retrieved' });
        node.error('SONOS-PLUS::Error::' + 'get track. ' + 'Details: ' + 'invalid track object retrieved.');
      } else {
        // message albumArtURL property
        if (trackObj.albumArtURI !== undefined && trackObj.albumArtURI !== null) {
          node.log('SONOS_PLUS::Info::' + 'got valid albumArtURI');
          var port = 1400;
          trackObj.albumArtURL = 'http://' + sonosPlayer.host + ':' + port + trackObj.albumArtURI;
        }
        if (trackObj.artist !== undefined && trackObj.artist !== null) {
          node.log('SONOS_PLUS::Info::' + 'got artist and title');
          artist = trackObj.artist;
          title = trackObj.title;
        } else {
          if (trackObj.title.indexOf(' - ') > 0) {
            node.log('SONOS_PLUS::Info::' + 'could split data to artist and title');
            artist = trackObj.title.split(' - ')[0];
            title = trackObj.title.split(' - ')[1];
          }
        }
        // Output data
        msg.track = trackObj;
        msg.artist = artist;
        msg.title = title;
        // Send output
        node.status({ fill: 'green', shape: 'dot', text: 'OK got track and all other data.' });
        node.log('SONOS_PLUS::Info::' + 'got all data - finsih');
        node.send(msg);
      }
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve current track' });
      node.error('SONOS-PLUS::Error::' + 'Could not get track.' + 'Details:' + JSON.stringify(err));
    });
  }

  RED.nodes.registerType('sonos-get-status', SonosGetStatusNode);
};
