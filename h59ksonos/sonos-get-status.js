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
        node.debug('node on - msg received');
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
          node.error('process message - invalid configNode. Please modify!');
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
      getSonosCurrentSong(node, msg, sonosPlayer, true);
    } else if (command === 'get_songinfo') {
      getSonosCurrentSong(node, msg, sonosPlayer, false);
    } else if (command === 'get_mediainfo') {
      getSonosMediaInfo(node, msg, sonosPlayer, false);
    } else if (command === 'get_positioninfo') {
      getSonosPositionInfo(node, msg, sonosPlayer, false);
    } else {
      node.status({ fill: 'green', shape: 'dot', text: 'warning:depatching commands - invalid command' });
      node.warn('depatching commands - invalid command: ' + command);
    }
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
    var errorShort = 'invalid player state received';
    sonosPlayer.getCurrentState().then(response => {
      if (response === null || response === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
        node.error(`${sonosFunction} - ${errorShort} Details: respose ->` + JSON.stringify(response));
        return;
      }
      msg.state = response;
      if (chain) {
        node.debug('got valid player state');
        getSonosVolume(node, msg, sonosPlayer, true);
      } else {
        node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
        node.debug(`ok:${sonosFunction}`);
        node.send(msg);
      }
    }).catch(err => {
      errorShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
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
    var errorShort = 'invalid volume received';
    sonosPlayer.getVolume().then(response => {
      if (response === null || response === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
        node.error(`${sonosFunction} - ${errorShort} Details: respose ->` + JSON.stringify(response));
        return;
      }
      if (response < 0 || response > 100) {
        errorShort = 'invalid volume rage received';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
        node.error(`${sonosFunction}  - ${errorShort} Details: ` + JSON.stringify(response));
        return;
      }
      // Output data
      msg.volume = response;
      msg.normalized_volume = response / 100.0;
      node.debug('got valid volume');
      getSonosMuted(node, msg, sonosPlayer, chain);
    }).catch(err => {
      errorShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
    });
  }

  function getSonosMuted (node, msg, sonosPlayer, chain) {
    //   changes msg.muted
    var sonosFunction = 'muted';
    var errorShort = 'invalid muted received';
    sonosPlayer.getMuted().then(response => {
      if (response === null || response === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
        node.error(`${sonosFunction} - ${errorShort} Details: respose ->` + JSON.stringify(response));
        return;
      }
      // Output data
      node.debug('got valid mute value');
      msg.muted = response;
      getSonosName(node, msg, sonosPlayer, chain);
    }).catch(err => {
      errorShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
    });
  }

  function getSonosName (node, msg, sonosPlayer, chain) {
    //   changes msg.sonosName
    var sonosFunction = 'SONOS name';
    var errorShort = 'invalid SONOS name received';
    sonosPlayer.getName().then(response => {
      if (response === null || response === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
        node.error(`${sonosFunction} - ${errorShort} Details: respose ->` + JSON.stringify(response));
        return;
      }
      // Output data
      node.debug('got valid Sonos player name');
      msg.sonosName = response;
      getSonosGroupAttributes(node, msg, sonosPlayer, chain);
    }).catch(err => {
      errorShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
    });
  }

  function getSonosGroupAttributes (node, msg, sonosPlayer, chain) {
    //   changes msg.sonosGroup
    var sonosFunction = 'group attributes';
    var errorShort = 'invalid group attributes received';
    sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes().then(response => {
      if (response === null || response === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
        node.error(`${sonosFunction} - ${errorShort} Details: respose ->` + JSON.stringify(response));
        return;
      }
      // Output data
      node.debug('got valid Groups');
      msg.sonosGroup = response;
      node.status({ fill: 'green', shape: 'dot', text: 'ok:get basics' });
      node.debug('ok:get basics');
      node.send(msg);
    }).catch(err => {
      errorShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
    });
  }

  // next chain command for song, media, position

  function getSonosCurrentSong (node, msg, sonosPlayer, chain) {
    // finally changes  msg.title (string), msg.artist (string), msg.song (obj) msg.media (obj), msg.position (obj)
    // first step artist, title
    var artist = 'unknown';
    var title = 'unknown';
    var albumArtURL = 'unknown';
    var sonosFunction = 'current song';
    var errorShort = 'invalid current song received';
    sonosPlayer.currentTrack().then(response => {
      if (response === null || response === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
        node.error(`${sonosFunction} - ${errorShort} Details: respose ->` + JSON.stringify(response));
        return;
      }
      // message albumArtURL property
      if (response.albumArtURI !== undefined && response.albumArtURI !== null) {
        node.debug('got valid albumArtURI');
        const port = 1400;
        albumArtURL = 'http://' + sonosPlayer.host + ':' + port + response.albumArtURI;
      } else {
        // TuneIn does not provide AlbumArtURL -so we continure
      }
      if (response.artist !== undefined && response.artist !== null) {
        node.debug('got artist and title');
        artist = response.artist;
        title = response.title;
      } else {
        if (response.title.indexOf(' - ') > 0) {
          // TuneIn provides artist and title in title field
          node.debug('could split data to artist and title');
          artist = response.title.split(' - ')[0];
          title = response.title.split(' - ')[1];
        } else {
          errorShort = 'invalid combination artist title received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
          node.error(`${sonosFunction}  - ${errorShort} Details: ` + JSON.stringify(response));
          return;
        }
      }
      // Output data
      msg.song = response;
      msg.artist = artist;
      msg.title = title;
      msg.albumArtURL = albumArtURL;

      if (chain) {
        node.debug('got current song information');
        getSonosMediaInfo(node, msg, sonosPlayer, chain);
      } else {
        node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
        node.debug(`ok:${sonosFunction}`);
        node.send(msg);
      }
    }).catch(err => {
      errorShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
    });
  }

  function getSonosMediaInfo (node, msg, sonosPlayer, chain) {
    //   changes msg.media
    var sonosFunction = 'media info';
    var errorShort = 'invalid media info received';
    sonosPlayer.avTransportService().GetMediaInfo().then(response => {
      if (response === null || response === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
        node.error(`${sonosFunction} - ${errorShort} Details: respose ->` + JSON.stringify(response));
        return;
      }
      var uri = response.CurrentURI;
      if (uri.startsWith('x-rincon-queue')) {
        response.queue_active = true;
      } else {
        response.queue_active = false;
      }

      msg.media = response;
      if (chain) {
        node.debug('got valid media info');
        getSonosPositionInfo(node, msg, sonosPlayer, chain);
      } else {
        node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
        node.debug(`ok:${sonosFunction}`);
        node.send(msg);
      }
    }).catch(err => {
      errorShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
    });
  }

  function getSonosPositionInfo (node, msg, sonosPlayer, chain) {
    //   changes msg.position
    var sonosFunction = 'position info';
    var errorShort = 'invalid position info received';
    sonosPlayer.avTransportService().GetPositionInfo().then(response => {
      node.debug(JSON.stringify(response));
      if (response === null || response === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
        node.error(`${sonosFunction} - ${errorShort} Details: respose ->` + JSON.stringify(response));
        return;
      }
      node.debug('got valid positon info');
      msg.position = response;
      // Send output
      if (chain) {
        node.debug('got valid position info');
        node.status({ fill: 'green', shape: 'dot', text: 'ok:get songmedia' });
        node.debug('ok:get songmedia');
      } else {
        node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
        node.debug(`ok:${sonosFunction}`);
      }
      node.send(msg);
    }).catch(err => {
      errorShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
    });
  }

  RED.nodes.registerType('sonos-get-status', SonosGetStatusNode);
};
