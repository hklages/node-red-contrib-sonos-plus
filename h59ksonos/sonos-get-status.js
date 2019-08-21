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
    var isValid = helper.validateConfigNodeV3(configNode);
    if (isValid) {
      // clear node status
      node.status({});

      // handle input message (the different requests are chained)
      node.on('input', function (msg) {
        node.log('input received');
        // TODO get sonosPlayer and handover instead of ipAddress

        helper.identifyPlayerProcessInputMsg(node, configNode, msg, function (ipAddress) {
          if (ipAddress === null) {
            // error handling node status, node error is done in identifyPlayerProcessInputMsg
            node.log('Could not find any sonos player!');
            node.send(msg);
          } else {
            node.log('Found sonos player and continue!');
            handleInputMsg(node, msg, ipAddress);
          }
        });
      });
    } else {
      node.status({ fill: 'red', shape: 'dot', text: 'invalid configNode' });
      node.error('Invalid configNode. Please edit configNode:');
    }
  }

  function handleInputMsg (node, msg, ipaddress) {
    /**  Validate sonos player and input message then dispatch
    * @param  {Object} node current node
    * @param  {object} msg incoming message
    * @param  {string} ipaddress IP address of sonos player
    */

    // get sonos player
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (sonosPlayer === null || sonosPlayer === undefined) {
      node.status({ fill: 'red', shape: 'dot', text: 'sonos player is null.' });
      node.error('Sonos player is null. Check configuration.');
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (!(msg.payload !== null && msg.payload !== undefined && msg.payload)) {
      node.status({ fill: 'red', shape: 'dot', text: 'invalid payload.' });
      node.error('Invalid payload. ' + JSON.stringify(msg.payload));
      return;
    }

    var command = msg.payload;
    command = '' + command;// convert to string
    command = command.toLowerCase();

    // dispatch
    if (command === 'state_only') {
      getSonosCurrentState(node, msg, sonosPlayer, false);
    } else if (command === 'basics') {
      getSonosCurrentState(node, msg, sonosPlayer, true);
    } else if (command === 'song_media') {
      getSonosCurrentTrack(node, msg, sonosPlayer, true);
    } else {
      node.status({ fill: 'green', shape: 'dot', text: 'warning invalid command' });
      node.warn('invalid command: ' + command);
    }
    node.log('Success::' + 'Command handed over (async) to specific function');
  }

  // ------------------------------------------------------------------------------------------

  function getSonosCurrentState (node, msg, sonosPlayer, chain) {
    /**  Validate sonos player and input message then get state and all other data.
    * @param  {Object} node current node
    * @param  {Object} msg incoming message
    * @param  {Object} sonosPlayer SONOS player object
    * @param  {Boolean} chain start request for other status information (chaining)
    * changes msg.state
    */

    // execute first api to get state
    sonosPlayer.getCurrentState().then(state => {
      if (state === null || state === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid current state retrieved' });
        node.error('get state. ' + 'Details: ' + 'invalid response from player.');
        return;
      }
      msg.state = state;
      if (chain) {
        node.log('Continue to get other info.');
        getSonosVolume(node, msg, sonosPlayer, true);
      } else {
        node.status({ fill: 'green', shape: 'dot', text: 'OK got state' });
        node.log('got valid state.');
        node.send(msg);
      }
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve current state' });
      node.error('Could not get current state.' + 'Details:' + JSON.stringify(err));
    });
  }

  function getSonosVolume (node, msg, sonosPlayer, chain) {
    /**  get sonos volume for selected player and continue in chain
    * @param  {Object} node current node
    * @param  {Object} msg incoming message
    * @param  {Object} sonosPlayer SONOS player object
    * @param  {Boolean} chain start request for other status information (chaining)
    * changes msg.volume, msg.normalized_volume
    */

    sonosPlayer.getVolume().then(volume => {
      if (volume === null || volume === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid volume retrieved' });
        node.error('get volume. ' + 'Details: ' + 'invalid response from player.');
        return;
      }
      if (volume < 0 || volume > 100) {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid volume range retrieved' });
        node.error('get volume. ' + 'Details: ' + 'volume out of range [0..100].');
        return;
      }
      // Output data
      msg.volume = volume;
      msg.normalized_volume = volume / 100.0;
      node.log('got valid volume and continue');
      getSonosMuted(node, msg, sonosPlayer, chain);
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve volume.' });
      node.error('Could not get current volume.' + 'Details:' + JSON.stringify(err));
    });
  }

  function getSonosMuted (node, msg, sonosPlayer, chain) {
    //   changes msg.muted
    sonosPlayer.getMuted().then(muted => {
      if (muted === null || muted === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid mute value retrieved' });
        node.error('get mute. ' + 'Details: ' + 'invalid mute response from player.');
        return;
      }

      // Output data
      node.log('got valid mute value and continue');
      msg.muted = muted;
      getSonosName(node, msg, sonosPlayer, chain);
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve Mute status' });
      node.error('Could not get mute state.' + 'Details:' + JSON.stringify(err));
    });
  }

  function getSonosName (node, msg, sonosPlayer, chain) {
    //   changes msg.sonosName
    sonosPlayer.getName().then(name => {
      // Output data
      node.log('got valid Sonos player name and continue');
      msg.sonosName = name;
      getSonosGroupAttributes(node, msg, sonosPlayer, chain);
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve name' });
      node.error('Could not get name.' + 'Details:' + JSON.stringify(err));
    });
  }

  function getSonosGroupAttributes (node, msg, sonosPlayer, chain) {
    //   changes msg.sonosGroup
    sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes().then(attributes => {
      // Output data
      node.log('got valid Groups and continue');
      msg.sonosGroup = attributes;
      node.status({ fill: 'green', shape: 'dot', text: 'OK got all basic data.' });
      node.log('got all data - finsih');
      node.send(msg);
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve groups' });
      node.error('Could not get goups.' + 'Details:' + JSON.stringify(err));
    });
  }

  // next chain command for song, media, position

  function getSonosCurrentTrack (node, msg, sonosPlayer, chain) {
    // finally changes  msg.title (string), msg.artist (string), msg.song (obj) msg.media (obj), msg.position (obj)
    // first step artist, title
    var artist = 'unknown';
    var title = 'unknown';
    sonosPlayer.currentTrack().then(songObj => {
      if (songObj === null || songObj === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid current song retrieved' });
        node.error('get song details. ' + 'Details: ' + 'invalid song object retrieved.');
      } else {
        // message albumArtURL property
        if (songObj.albumArtURI !== undefined && songObj.albumArtURI !== null) {
          node.log('got valid albumArtURI');
          var port = 1400;
          songObj.albumArtURL = 'http://' + sonosPlayer.host + ':' + port + songObj.albumArtURI;
        }
        if (songObj.artist !== undefined && songObj.artist !== null) {
          node.log('got artist and title');
          artist = songObj.artist;
          title = songObj.title;
        } else {
          if (songObj.title.indexOf(' - ') > 0) {
            node.log('could split data to artist and title');
            artist = songObj.title.split(' - ')[0];
            title = songObj.title.split(' - ')[1];
          }
        }
        // Output data
        msg.song = songObj;
        msg.artist = artist;
        msg.title = title;
        node.log('could get song data and continue');
        getSonosMediaData(node, msg, sonosPlayer, true);
      }
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve current song' });
      node.error('Could not get song.' + 'Details:' + JSON.stringify(err));
    });
  }

  function getSonosMediaData (node, msg, sonosPlayer, chain) {
    //   changes msg.media
    sonosPlayer.avTransportService().GetMediaInfo().then(media => {
      node.log('got valid media data and continue');
      msg.media = media;
      getSonosPositionData(node, msg, sonosPlayer, chain);
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve media data' });
      node.error('Could not get media data.' + 'Details:' + JSON.stringify(err));
    });
  }

  function getSonosPositionData (node, msg, sonosPlayer, chain) {
    //   changes msg.position
    sonosPlayer.avTransportService().GetPositionInfo().then(position => {
      node.log('got valid positon data');
      msg.position = position;
      // Send output
      node.status({ fill: 'green', shape: 'dot', text: 'OK got all.' });
      node.log('got all data for song, media, positon data - finish');
      node.send(msg);
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve positon data' });
      node.error('Could not get position data.' + 'Details:' + JSON.stringify(err));
    });
  }

  RED.nodes.registerType('sonos-get-status', SonosGetStatusNode);
};
