var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosGetStatusNode (config) {
    /**  Create Get Status Node and subscribe to messages
    * @param  {object} config current node configuration data
    */

    RED.nodes.createNode(this, config);

    // verify config node. if valid then set status and subscribe to messages
    var node = this;
    var configNode = RED.nodes.getNode(config.confignode);
    var isValid = helper.validateConfigNodeV3(configNode);
    if (isValid) {
      // clear node status
      node.status({});
      // subscribe and handle input message (the different requests are chained)
      node.on('input', function (msg) {
        node.debug('start: msg received');
        // check again configNode - in the meantime it might have changed
        var isStillValid = helper.validateConfigNodeV3(configNode);
        if (isStillValid) {
          helper.identifyPlayerProcessInputMsg(node, configNode, msg, function (ipAddress) {
            if (ipAddress === undefined || ipAddress === null) {
            // error handling node status, node error is done in identifyPlayerProcessInputMsg
            } else {
              node.debug('Found sonos player');
              handleInputMsg(node, msg, ipAddress);
            }
          });
        } else {
          node.status({ fill: 'red', shape: 'dot', text: 'error:process message - invalid configNode' });
          node.error('error:process message - invalid configNode. Please modify!');
        }
      });
    } else {
      node.status({ fill: 'red', shape: 'dot', text: 'error:setup subscribe - invalid configNode' });
      node.error('setup subscribe - invalid configNode. Please modify!');
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
      node.status({ fill: 'red', shape: 'dot', text: 'error: get sonosplayer - sonos player is null.' });
      node.error('get sonosplayer - sonos player is null. Check configuration.');
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (!(msg.payload !== null && msg.payload !== undefined && msg.payload)) {
      node.status({ fill: 'red', shape: 'dot', text: 'error:validate payload - invalid payload.' });
      node.error('validate payload - invalid payload. Details' + JSON.stringify(msg.payload));
      return;
    }

    var command = msg.payload;
    command = '' + command;// convert to string
    command = command.toLowerCase();

    // dispatch
    if (command === 'get_stateonly') {
      getSonosCurrentState(node, msg, sonosPlayer, false);
    } else if (command === 'get_basics') {
      getSonosCurrentState(node, msg, sonosPlayer, true);
    } else if (command === 'get_songmedia') {
      getSonosCurrentTrack(node, msg, sonosPlayer, true);
    } else {
      node.status({ fill: 'green', shape: 'dot', text: 'warning:depatching commands - invalid command' });
      node.warn('depatching commands - invalid command: ' + command);
    }
    node.debug('Command handed over (async)');
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
    var sonosFunction = 'player state';
    var errDetails = 'invalid player state received';
    sonosPlayer.getCurrentState().then(state => {
      if (state === null || state === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errDetails}` });
        node.error(`${sonosFunction}  Details: ${errDetails}`);
        return;
      }
      msg.state = state;
      if (chain) {
        node.debug('got valid player state');
        getSonosVolume(node, msg, sonosPlayer, true);
      } else {
        node.status({ fill: 'green', shape: 'dot', text: `OK:${sonosFunction}` });
        node.debug(`OK:${sonosFunction}`);
        node.send(msg);
      }
    }).catch(err => {
      errDetails = JSON.stringify(err);
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - see log` });
      node.error(`${sonosFunction}  Details: ${errDetails}`);
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
    var sonosFunction = 'volume';
    var errDetails = 'invalid volume received';
    sonosPlayer.getVolume().then(volume => {
      if (volume === null || volume === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errDetails}` });
        node.error(`${sonosFunction}  Details: ${errDetails}`);
        return;
      }
      if (volume < 0 || volume > 100) {
        errDetails = 'invalid volume rage received';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errDetails}` });
        node.error(`${sonosFunction}  Details: ${errDetails}`);
        return;
      }
      // Output data
      msg.volume = volume;
      msg.normalized_volume = volume / 100.0;
      node.debug('got valid volume');
      getSonosMuted(node, msg, sonosPlayer, chain);
    }).catch(err => {
      errDetails = JSON.stringify(err);
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - see log` });
      node.error(`${sonosFunction}  Details: ${errDetails}`);
    });
  }

  function getSonosMuted (node, msg, sonosPlayer, chain) {
    //   changes msg.muted
    var sonosFunction = 'muted';
    var errDetails = 'invalid muted received';
    sonosPlayer.getMuted().then(muted => {
      if (muted === null || muted === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errDetails}` });
        node.error(`${sonosFunction}  Details: ${errDetails}`);
        return;
      }
      // Output data
      node.debug('got valid mute value');
      msg.muted = muted;
      getSonosName(node, msg, sonosPlayer, chain);
    }).catch(err => {
      errDetails = JSON.stringify(err);
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - see log` });
      node.error(`${sonosFunction}  Details: ${errDetails}`);
    });
  }

  function getSonosName (node, msg, sonosPlayer, chain) {
    //   changes msg.sonosName
    var sonosFunction = 'SONOS name';
    var errDetails = 'invalid SONOS name received';
    sonosPlayer.getName().then(name => {
      if (name === null || name === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errDetails}` });
        node.error(`${sonosFunction}  Details: ${errDetails}`);
        return;
      }
      // Output data
      node.debug('got valid Sonos player name');
      msg.sonosName = name;
      getSonosGroupAttributes(node, msg, sonosPlayer, chain);
    }).catch(err => {
      errDetails = JSON.stringify(err);
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - see log` });
      node.error(`${sonosFunction}  Details: ${errDetails}`);
    });
  }

  function getSonosGroupAttributes (node, msg, sonosPlayer, chain) {
    //   changes msg.sonosGroup
    var sonosFunction = 'group attributes';
    var errDetails = 'invalid group attributes received';
    sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes().then(attributes => {
      if (attributes === null || attributes === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errDetails}` });
        node.error(`${sonosFunction}  Details: ${errDetails}`);
        return;
      }
      // Output data
      node.debug('got valid Groups');
      msg.sonosGroup = attributes;
      node.status({ fill: 'green', shape: 'dot', text: 'OK:get_bascis' });
      node.debug('ok:get_basics');
      node.send(msg);
    }).catch(err => {
      errDetails = JSON.stringify(err);
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - see log` });
      node.error(`${sonosFunction}  Details: ${errDetails}`);
    });
  }

  // next chain command for song, media, position

  function getSonosCurrentTrack (node, msg, sonosPlayer, chain) {
    // finally changes  msg.title (string), msg.artist (string), msg.song (obj) msg.media (obj), msg.position (obj)
    // first step artist, title
    var artist = 'unknown';
    var title = 'unknown';
    var sonosFunction = 'current song';
    var errDetails = 'invalid current song received';
    sonosPlayer.currentTrack().then(songObj => {
      if (songObj === null || songObj === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errDetails}` });
        node.error(`${sonosFunction}  Details: ${errDetails}`);
        return;
      }
      // message albumArtURL property
      if (songObj.albumArtURI !== undefined && songObj.albumArtURI !== null) {
        node.debug('got valid albumArtURI');
        var port = 1400;
        songObj.albumArtURL = 'http://' + sonosPlayer.host + ':' + port + songObj.albumArtURI;
      } else {
        errDetails = 'invalid album art received';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errDetails}` });
        node.error(`${sonosFunction}  Details: ${errDetails}`);
        return;
      }
      if (songObj.artist !== undefined && songObj.artist !== null) {
        node.debug('got artist and title');
        artist = songObj.artist;
        title = songObj.title;
      } else {
        if (songObj.title.indexOf(' - ') > 0) {
          node.debug('could split data to artist and title');
          artist = songObj.title.split(' - ')[0];
          title = songObj.title.split(' - ')[1];
        } else {
          errDetails = 'invalid combination artist title received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errDetails}` });
          node.error(`${sonosFunction}  Details: ${errDetails}`);
          return;
        }
      }
      // Output data
      msg.song = songObj;
      msg.artist = artist;
      msg.title = title;
      getSonosMediaData(node, msg, sonosPlayer, true);
    }).catch(err => {
      errDetails = JSON.stringify(err);
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - see log` });
      node.error(`${sonosFunction}  Details: ${errDetails}`);
    });
  }

  function getSonosMediaData (node, msg, sonosPlayer, chain) {
    //   changes msg.media
    var sonosFunction = 'media data';
    var errDetails = 'invalid media data received';
    sonosPlayer.avTransportService().GetMediaInfo().then(media => {
      if (media === null || media === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errDetails}` });
        node.error(`${sonosFunction}  Details: ${errDetails}`);
        return;
      }
      node.debug('got valid media data');
      msg.media = media;
      getSonosPositionData(node, msg, sonosPlayer, chain);
    }).catch(err => {
      errDetails = JSON.stringify(err);
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - see log` });
      node.error(`${sonosFunction}  Details: ${errDetails}`);
    });
  }

  function getSonosPositionData (node, msg, sonosPlayer, chain) {
    //   changes msg.position
    var sonosFunction = 'position data';
    var errDetails = 'invalid position datareceived';
    sonosPlayer.avTransportService().GetPositionInfo().then(position => {
      if (position === null || position === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errDetails}` });
        node.error(`${sonosFunction}  Details: ${errDetails}`);
        return;
      }
      node.debug('got valid positon data');
      msg.position = position;
      // Send output
      node.status({ fill: 'green', shape: 'dot', text: 'OK:got tracksmedia' });
      node.debug('OK:got tracksmedia');
      node.send(msg);
    }).catch(err => {
      errDetails = JSON.stringify(err);
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - see log` });
      node.error(`${sonosFunction}  Details: ${errDetails}`);
    });
  }

  RED.nodes.registerType('sonos-get-status', SonosGetStatusNode);
};
