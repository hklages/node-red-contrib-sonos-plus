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
    const sonosFunction = 'create node get status';
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
            if (typeof ipAddress === 'undefined' || ipAddress === null ||
              (typeof ipAddress === 'number' && isNaN(ipAddress)) || ipAddress === '') {
            // error handling node status, node error is done in identifyPlayerProcessInputMsg
            } else {
              node.debug('Found sonos player');
              handleInputMsg(node, msg, ipAddress);
            }
          });
        } else {
          helper.showError(node, msg, new Error('n-r-c-s-p: Please modify config node'), sonosFunction, 'process message - invalid configNode');
        }
      });
    } else {
      // no msg available!
      const msgShort = 'setup subscribe - invalid configNode';
      const errorDetails = 'Please modify config node';
      node.error(`${sonosFunction} - ${msgShort} Details: ` + errorDetails);
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
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
    const sonosFunction = 'handle input msg';
    if (typeof sonosPlayer === 'undefined' || sonosPlayer === null ||
      (typeof sonosPlayer === 'number' && isNaN(sonosPlayer)) || sonosPlayer === '') {
      helper.showError(node, msg, new Error('n-r-c-s-p: Check configuration'), sonosFunction, 'invalid sonos player.');
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (typeof msg.payload === 'undefined' || msg.payload === null ||
      (typeof msg.payload === 'number' && isNaN(msg.payload)) || msg.payload === '') {
      helper.showError(node, msg, new Error('n-r-c-s-p: invalid payload ' + JSON.stringify(msg)), sonosFunction, 'invalid payload');
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
      helper.showWarning(node, sonosFunction, 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(command));
    }
  }

  // -----------------------------------------------------
  // start chain get_basics
  // -----------------------------------------------------

  /** Get the sonos player state and either outputs or starts another asyn request (chaining).
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @param  {String} outputType selector for output type: chainidentifier, 'seperate' and default = 'payload'
  * changes msg.state or msg.payload
  */
  function getPlayerStateV2 (node, msg, sonosPlayer, outputType) {
    const sonosFunction = 'get player state';
    sonosPlayer.getCurrentState()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid player state received ' + JSON.stringify(response)), sonosFunction, 'invalid player state received');
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
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
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
    sonosPlayer.getVolume()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '' || isNaN(response)) {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid player volume received ' + JSON.stringify(response)), sonosFunction, 'invalid player volume received');
          return;
        }

        if (response < 0 || response > 100) {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid volume range received ' + JSON.stringify(response)), sonosFunction, 'invalid volume range received');
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
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
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
    sonosPlayer.getMuted()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid mute state received ' + JSON.stringify(response)), sonosFunction, 'invalid mute state received');
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
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
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
    sonosPlayer.getName()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid player name received ' + JSON.stringify(response)), sonosFunction, 'invalid player name received');
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
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
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
    sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid zone received ' + JSON.stringify(response)), sonosFunction, 'invalid zone received');
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
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
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
    sonosPlayer.deviceDescription()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid player properties received ' + JSON.stringify(response)), sonosFunction, 'invalid player properties received');
          return;
        }

        // Output data to payload
        helper.showSuccess(node, sonosFunction);
        msg.payload = response;
        node.send(msg);
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
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
    sonosPlayer.currentTrack()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid current song received ' + JSON.stringify(response)), sonosFunction, 'invalid current song received');
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
            helper.showWarning(node, sonosFunction, 'invalid combination artist title received', 'received-> ' + JSON.stringify(response));
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
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
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
    sonosPlayer.avTransportService().GetMediaInfo()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid media info received ' + JSON.stringify(response)), sonosFunction, 'invalid media info received');
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
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
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
    sonosPlayer.avTransportService().GetPositionInfo()
      .then(response => {
        node.debug(JSON.stringify(response));
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid position info received ' + JSON.stringify(response)), sonosFunction, 'invalid position info received');
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
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }

  RED.nodes.registerType('sonos-get-status', SonosGetStatusNode);
};
