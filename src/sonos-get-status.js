const SonosHelper = require('./SonosHelper.js');
const helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  /**  Create Get Status Node and subscribe to messages
  * @param  {object} config current node configuration data
  */
  function SonosGetStatusNode (config) {
    RED.nodes.createNode(this, config);

    // verify config node. if valid then set status and subscribe to messages
    const node = this;
    const configNode = RED.nodes.getNode(config.confignode);
    const isValid = helper.validateConfigNodeV3(configNode);
    if (isValid) {
      // clear node status
      node.status({});
      // subscribe and handle input message (the different requests are chained)
      node.on('input', function (msg) {
        node.debug('node on - msg received');
        // check again configNode - in the meantime it might have changed
        const isStillValid = helper.validateConfigNodeV3(configNode);
        if (isStillValid) {
          helper.identifyPlayerProcessInputMsg(node, configNode, msg, function (ipAddress) {
            if (typeof ipAddress === 'undefined' || ipAddress === null || ipAddress === '') {
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

  /**  Validate sonos player and input message then dispatch further.
  * @param  {Object} node current node
  * @param  {object} msg incoming message
  * @param  {string} ipaddress IP address of sonos player
  */
  function handleInputMsg (node, msg, ipaddress) {
    // get sonos player
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (typeof sonosPlayer === 'undefined' || sonosPlayer === null || sonosPlayer === '') {
      node.status({ fill: 'red', shape: 'dot', text: 'error: get sonosplayer - sonos player is null.' });
      node.error('get sonosplayer - sonos player is null. Check configuration.');
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (typeof msg.payload === 'undefined' || msg.payload === null || msg.payload === '') {
      node.status({ fill: 'red', shape: 'dot', text: 'error:validate payload - invalid payload.' });
      node.error('validate payload - invalid payload. Details' + JSON.stringify(msg.payload));
      return;
    }
    let command = String(msg.payload);
    command = command.toLowerCase();

    // dispatch
    if (command === 'get_basics') {
      // CAUTION last parameter initiates a "chain" --> async
      getPlayerStateV2(node, msg, sonosPlayer, 'get_basics');
    } else if (command === 'get_stateonly') {
      // for compatibility reasons - depreciated
      getPlayerStateV2(node, msg, sonosPlayer, 'separate');
    } else if (command === 'get_state') {
      getPlayerStateV2(node, msg, sonosPlayer, '');
    } else if (command === 'get_volume') {
      getPlayerVolumeV2(node, msg, sonosPlayer, false);
    } else if (command === 'get_muted') {
      getPlayerMutedV2(node, msg, sonosPlayer, false);
    } else if (command === 'get_sonosname') {
    // for compatibility reasons - depreciated
      getPlayerNameV2(node, msg, sonosPlayer, 'separate');
    } else if (command === 'get_name') {
      getPlayerNameV2(node, msg, sonosPlayer, '');
    } else if (command === 'get_properties') {
      getPlayerProperties(node, msg, sonosPlayer);
    } else if (command === 'get_songmedia') {
      // CAUTION last parameter initiates a "chain" --> async
      getPlayerCurrentSong(node, msg, sonosPlayer, 'get_songmedia');
    } else if (command === 'get_songinfo') {
      getPlayerCurrentSong(node, msg, sonosPlayer, '');
    } else if (command === 'get_mediainfo') {
      getMediaInfo(node, msg, sonosPlayer, '');
    } else if (command === 'get_positioninfo') {
      getPositionInfo(node, msg, sonosPlayer, '');
    } else {
      node.status({ fill: 'green', shape: 'dot', text: 'warning:depatching commands - invalid command' });
      node.warn('depatching commands - invalid command: ' + command);
    }
  }

  // -----------------------------------------------------
  // start chain get_basics
  // -----------------------------------------------------

  /** Gets the sonos player state and either outputs or starts another asyn request (chaining).
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @param  {String} outputType selector for output type: chainidentifier, 'seperate' and default = 'payload'
  * changes msg.state or msg.payload
  */
  function getPlayerStateV2 (node, msg, sonosPlayer, outputType) {
    const sonosFunction = 'get player state';
    let msgShort = '';
    sonosPlayer.getCurrentState()
      .then(response => {
        if (typeof response === 'undefined' || response === null || response === '') {
          msgShort = 'invalid player state received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: respose ->` + JSON.stringify(response));
          return;
        }

        // output chaining, to seperate msg property or to msg.payload
        node.debug('got valid player state');
        switch (outputType) {
          case 'get_basics':
          // part of a chain, dont send message
            msg.state = response;
            node.debug('chain next command');
            getPlayerVolumeV2(node, msg, sonosPlayer, 'get_basics');
            break;
          case 'separate':
            helper.showSuccess(node, sonosFunction);
            msg.state = response;
            node.send(msg);
            break;
          default:
          // payload
            node.debug('output to payload');
            helper.showSuccess(node, sonosFunction);
            msg.payload = response;
            node.send(msg);
        }
      })
      .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
  }

  /** Gets the sonos player volume and either outputs or starts another asyn request (chaining).
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @param  {String} outputType selector for output type: chainidentifier, 'seperate' and default = 'payload'
  * changes msg.volume and msg.normalized_volume or msg.payload
  */
  function getPlayerVolumeV2 (node, msg, sonosPlayer, outputType) {
    const sonosFunction = 'get player volume';
    let msgShort = '';
    sonosPlayer.getVolume()
      .then(response => {
        if (typeof response === 'undefined' || response === null || response === '') {
          msgShort = 'invalid player volume received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: respose ->` + JSON.stringify(response));
          return;
        }
        // TODO check number
        if (response < 0 || response > 100) {
          msgShort = 'invalid volume rage received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction}  - ${msgShort} Details: ` + JSON.stringify(response));
          return;
        }

        // output chaining, to seperate msg property or to msg.payload
        node.debug('got valid player volume');
        switch (outputType) {
          case 'get_basics':
            // part of a chain, dont send message
            msg.volume = response;
            msg.normalized_volume = response / 100.0;
            node.debug('got volume data and continue');
            getPlayerMutedV2(node, msg, sonosPlayer, 'get_basics');
            break;
          case 'separate':
            helper.showSuccess(node, sonosFunction);
            msg.volume = response;
            msg.normalized_volume = response / 100.0;
            node.send(msg);
            break;
          default:
          // payload
            helper.showSuccess(node, sonosFunction);
            msg.payload = response;
            node.send(msg);
        }
      })
      .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
  }

  /** Gets the sonos player muted state and either outputs or starts another asyn request (chaining).
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @param  {String} outputType selector for output type: chainidentifier, 'seperate' and default = 'payload'
  * changes msg.muted or msg.payload
  */
  function getPlayerMutedV2 (node, msg, sonosPlayer, outputType) {
    const sonosFunction = 'get player muted state';
    let msgShort = '';
    sonosPlayer.getMuted()
      .then(response => {
        if (typeof response === 'undefined' || response === null || response === '') {
          msgShort = 'invalid muted state received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: respose ->` + JSON.stringify(response));
          return;
        }

        // output chaining, to seperate msg property or to msg.payload
        node.debug('got valid player muted state');
        switch (outputType) {
          case 'get_basics':
            // part of a chain, dont send message
            msg.muted = response;
            getPlayerNameV2(node, msg, sonosPlayer, 'get_basics');
            break;
          case 'separate':
            helper.showSuccess(node, sonosFunction);
            msg.muted = response;
            node.send(msg);
            break;
          default:
          // payload
            helper.showSuccess(node, sonosFunction);
            msg.payload = response;
            node.send(msg);
        }
      })
      .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
  }

  /** Gets the sonos player name and either outputs or starts another asyn request (chaining).
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @param  {String} outputType selector for output type: chainidentifier, 'seperate' and default = 'payload'
  * changes msg.sonosName or msg.payload
  */
  function getPlayerNameV2 (node, msg, sonosPlayer, outputType) {
    const sonosFunction = 'get player name';
    let msgShort = '';
    sonosPlayer.getName()
      .then(response => {
        if (typeof response === 'undefined' || response === null || response === '') {
          msgShort = 'invalid player name received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: respose ->` + JSON.stringify(response));
          return;
        }

        // output chaining, to seperate msg property or to msg.payload
        node.debug('got valid player name');
        switch (outputType) {
          case 'get_basics':
            // part of a chain, dont send message
            msg.sonosName = response;
            getPlayerGroupAttributesV2(node, msg, sonosPlayer, 'get_basics');
            break;
          case 'separate':
            helper.showSuccess(node, sonosFunction);
            msg.sonosName = response;
            node.send(msg);
            break;
          default:
          // payload
            helper.showSuccess(node, sonosFunction);
            msg.payload = response;
            node.send(msg);
        }
      })
      .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
  }

  /** Gets the sonos player group attributes and either outputs or starts another asyn request (chaining).
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @param  {String} outputType selector for output type: chainidentifier, 'seperate' and default = 'payload'
  * changes msg.sonosGroup or msg.payload
  */
  function getPlayerGroupAttributesV2 (node, msg, sonosPlayer, outputType) {
    const sonosFunction = 'get group attributes';
    let msgShort = '';
    sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes()
      .then(response => {
        if (typeof response === 'undefined' || response === null || response === '') {
          msgShort = 'invalid groupt attributes received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: respose ->` + JSON.stringify(response));
          return;
        }

        // output chaining, to seperate msg property or to msg.payload
        node.debug('got group attributes');
        switch (outputType) {
          case 'get_basics':
            // end of chain
            msg.sonosGroup = response;
            helper.showSuccess(node, outputType);
            node.send(msg);
            break;
          case 'separate':
            helper.showSuccess(node, sonosFunction);
            msg.sonosGroup = response;
            node.send(msg);
            break;
          default:
          // payload
            helper.showSuccess(node, sonosFunction);
            msg.payload = response;
            node.send(msg);
        }
      })
      .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
  }

  // -----------------------------------------
  // end of chain (get basics)
  // -----------------------------------------

  /** Gets the sonos player properties and outputs to payload.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * changes msg.payload as object
  */
  function getPlayerProperties (node, msg, sonosPlayer) {
    const sonosFunction = 'get player properties';
    let msgShort = '';
    sonosPlayer.deviceDescription()
      .then(response => {
        if (typeof response === 'undefined' || response === null || response === '') {
          msgShort = 'invalid player properties received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: respose ->` + JSON.stringify(response));
          return;
        }

        // Output data to payload
        helper.showSuccess(node, sonosFunction);
        msg.payload = response;
        node.send(msg);
      })
      .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
  }

  // ---------------------------------------------------
  // start of chain get_songmedia
  // ---------------------------------------------------

  /** Gets the sonos player current song and either outputs or starts another asyn request (chaining).
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @param  {String} outputType selector for output type: chainidentifier, 'seperate' and default = 'payload'
  * changes msg.artist, title, albumArt, song, media and position info in chain mode
  */
  function getPlayerCurrentSong (node, msg, sonosPlayer, outputType) {
    let artist = 'unknown';
    let title = 'unknown';
    let albumArtURL = 'unknown';
    const sonosFunction = 'get current song';
    let msgShort = '';
    sonosPlayer.currentTrack()
      .then(response => {
        if (typeof response === 'undefined' || response === null || response === '') {
          msgShort = 'invalid current song received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: respose ->` + JSON.stringify(response));
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
            msgShort = 'warning: invalid combination artist title received';
            node.status({ fill: 'blue', shape: 'dot', text: `warn:${sonosFunction} - ${msgShort}` });
            node.warn(`${sonosFunction}  - ${msgShort} Details: ` + JSON.stringify(response));
            return;
          }
        }
        // Output data
        node.debug('got valid song info');
        msg.song = response;
        msg.artist = artist;
        msg.albumArtURL = albumArtURL;
        switch (outputType) {
          case 'get_songmedia':
            // part of a chain, dont send message
            node.debug('continue async');
            msg.title = title;
            getMediaInfo(node, msg, sonosPlayer, 'get_songmedia');
            break;
          case 'separate':
            helper.showSuccess(node, sonosFunction);
            msg.title = title;
            node.send(msg);
            break;
          default:
          // payload
            helper.showSuccess(node, sonosFunction);
            msg.payload = title;
            node.send(msg);
        }
      })
      .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
  }

  /** Gets the media info and either outputs or starts another asyn request (chaining).
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @param  {String} outputType selector for output type: chainidentifier, 'seperate' and default = 'payload'
  * changes msg.queue_active, msg.payload or msg.media
  */
  function getMediaInfo (node, msg, sonosPlayer, outputType) {
    const sonosFunction = 'get media info';
    let msgShort = '';
    sonosPlayer.avTransportService().GetMediaInfo()
      .then(response => {
        if (typeof response === 'undefined' || response === null || response === '') {
          msgShort = 'invalid media info received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: respose ->` + JSON.stringify(response));
          return;
        }
        const uri = response.CurrentURI;
        if (uri.startsWith('x-rincon-queue')) {
          response.queue_active = true;
        } else {
          response.queue_active = false;
        }

        // output chaining, to seperate msg property or to msg.payload
        node.debug('got valid media info');
        switch (outputType) {
          case 'get_songmedia':
            // part of a chain, dont send message
            msg.media = response;
            node.debug('continue');
            getPositionInfo(node, msg, sonosPlayer, 'get_songmedia');
            break;
          case 'separate':
            helper.showSuccess(node, sonosFunction);
            msg.media = response;
            node.send(msg);
            break;
          default:
          // payload
            helper.showSuccess(node, sonosFunction);
            msg.payload = response;
            node.send(msg);
        }
      })
      .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
  }

  /** Gets the position inf and either outputs or starts another asyn request (chaining).
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @param  {String} outputType selector for output type: chainidentifier, 'seperate' and default = 'payload'
  * changes msg.position or msg.payload
  */
  function getPositionInfo (node, msg, sonosPlayer, outputType) {
    const sonosFunction = 'position info';
    let msgShort = '';
    sonosPlayer.avTransportService().GetPositionInfo()
      .then(response => {
        node.debug(JSON.stringify(response));
        if (typeof response === 'undefined' || response === null || response === '') {
          msgShort = 'invalid position info received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: respose ->` + JSON.stringify(response));
          return;
        }

        // output chaining, to seperate msg property or to msg.payload
        node.debug('got valid positon info');
        switch (outputType) {
          case 'get_songmedia':
            // end of chain
            msg.position = response;
            helper.showSuccess(node, outputType);
            node.send(msg);
            break;
          case 'separate':
            helper.showSuccess(node, sonosFunction);
            msg.position = response;
            node.send(msg);
            break;
          default:
          // payload
            helper.showSuccess(node, sonosFunction);
            msg.payload = response;
            node.send(msg);
        }
      })
      .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
  }

  RED.nodes.registerType('sonos-get-status', SonosGetStatusNode);
};
