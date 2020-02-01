const SonosHelper = require('./SonosHelper.js');
const helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  /**  Create Get Status Node and subscribe to messages.
  * @param  {object} config current node configuration data
  */
  function SonosGetStatusNode (config) {
    RED.nodes.createNode(this, config);
    const sonosFunction = 'setup subscribe';

    const node = this;
    const configNode = RED.nodes.getNode(config.confignode);

    if (!helper.validateConfigNode(configNode)) {
      helper.nrcspFailure(node, null, new Error('n-r-c-s-p: invalid config node'), sonosFunction);
      return;
    }

    // clear node status
    node.status({});
    // subscribe and handle input message
    node.on('input', function (msg) {
      node.debug('node - msg received');

      // if ip address exist use it or get it via discovery based on serialNum
      if (!(typeof configNode.ipaddress === 'undefined' || configNode.ipaddress === null ||
        (typeof configNode.ipaddress === 'number' && isNaN(configNode.ipaddress)) || configNode.ipaddress.trim().length < 7)) {
        // exisiting ip address - fastes solution, no discovery necessary
        node.debug('using IP address of config node');
        processInputMsg(node, msg, configNode.ipaddress);
      } else {
        // have to get ip address via disovery with serial numbers
        helper.nrcspWarning(node, sonosFunction, 'No ip address', 'Providing ip address is recommended');
        if (!(typeof configNode.serialnum === 'undefined' || configNode.serialnum === null ||
                (typeof configNode.serialnum === 'number' && isNaN(configNode.serialnum)) || (configNode.serialnum.trim()).length < 19)) {
          helper.discoverSonosPlayerBySerial(node, configNode.serialnum, (err, ipAddress) => {
            if (err) {
              helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: discovery failed'), sonosFunction);
              return;
            }
            if (ipAddress === null) {
              helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: could not find any player by serial'), sonosFunction);
            } else {
              // setting of nodestatus is done in following call handelIpuntMessage
              node.debug('Found sonos player');
              processInputMsg(node, msg, ipAddress);
            }
          });
        } else {
          helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: invalid config node - invalid serial'), sonosFunction);
        }
      }
    });
  }

  /**  Validate sonos player and input message then dispatch further.
  * @param  {Object} node current node
  * @param  {object} msg incoming message
  * @param  {string} ipaddress IP address of sonos player
  */
  function processInputMsg (node, msg, ipaddress) {
    // get sonos player
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);

    const sonosFunction = 'handle input msg';

    if (typeof sonosPlayer === 'undefined' || sonosPlayer === null ||
      (typeof sonosPlayer === 'number' && isNaN(sonosPlayer)) || sonosPlayer === '') {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: undefined sonos player'), sonosFunction);
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (typeof msg.payload === 'undefined' || msg.payload === null ||
      (typeof msg.payload === 'number' && isNaN(msg.payload)) || msg.payload === '') {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: undefined payload', sonosFunction));
      return;
    }

    let command = String(msg.payload);
    command = command.toLowerCase();

    // dispatch
    if (command === 'get_basics') {
      getBasicsV1(node, msg, sonosPlayer);
    } else if (command === 'get_state') {
      getPlayerStateV3(node, msg, sonosPlayer);
    } else if (command === 'get_volume') {
      getPlayerVolumeV3(node, msg, sonosPlayer);
    } else if (command === 'get_muted') {
      getPlayerMutedV3(node, msg, sonosPlayer);
    } else if (command === 'get_name') {
      getPlayerNameV3(node, msg, sonosPlayer);
    } else if (command === 'get_led') {
      getPlayerLedStatus(node, msg, sonosPlayer);
    } else if (command === 'get_properties') {
      getPlayerProperties(node, msg, sonosPlayer);
    } else if (command === 'get_songmedia') {
      getPlayerSongMediaV1(node, msg, sonosPlayer);
    } else if (command === 'get_songinfo') {
      getPlayerCurrentSongV1(node, msg, sonosPlayer);
    } else if (command === 'get_mediainfo') {
      getMediaInfoV1(node, msg, sonosPlayer);
    } else if (command === 'get_positioninfo') {
      getPositionInfoV1(node, msg, sonosPlayer);
    } else if (command === 'get_mysonos') {
      getMySonosAll(node, msg, sonosPlayer);
    } else if (command === 'get_groups') {
      getGroupsInfo(node, msg, sonosPlayer);
    } else if (command === 'get_eq') {
      getEQInfo(node, msg, sonosPlayer);
    } else if (command === 'test_connected') {
      testConnected(node, msg, sonosPlayer);
    } else if (command === 'lab_newfunction') {
      labNewFunction(node, msg, sonosPlayer);
    } else {
      helper.nrcspWarning(node, sonosFunction, 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(command));
    }
  }

  // -----------------------------------------------------
  // Commands
  // -----------------------------------------------------

  /** Get the SONOS basic data and output to msg.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @output msg: state, volume, volumeNormalized, muted, name, group
  * This command will send several api calls and combine the results.
  */
  function getBasicsV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get basics';
    let state; let volume; let normalizedVolume; let muted; let sonosName; let sonosGroup;

    sonosPlayer.getCurrentState()
      .then((response) => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined player state received', sonosFunction);
        }
        state = response;
        return true;
      })
      .then(() => { return sonosPlayer.getVolume(); })
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined player volume received', sonosFunction);
        }
        volume = response;
        normalizedVolume = response / 100.0;
        return true;
      })
      .then(() => { return sonosPlayer.getMuted(); })
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined player muted state received', sonosFunction);
        }
        muted = response;
        return true;
      })
      .then(() => { return sonosPlayer.getName(); })
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined player name received', sonosFunction);
        }
        sonosName = response;
        return true;
      })
      .then(() => { return sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes(); })
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined zone group attributes received', sonosFunction);
        }
        sonosGroup = response;
        return true;
      })
      .then(() => {
        msg.state = state; msg.volume = volume; msg.volumeNormalized = normalizedVolume; msg.muted = muted; msg.name = sonosName; msg.group = sonosGroup;
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player state and outputs.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @output changes msg.payload
  */
  function getPlayerStateV3 (node, msg, sonosPlayer) {
    const sonosFunction = 'get player state';

    sonosPlayer.getCurrentState()
      .then((response) => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined player state received', sonosFunction);
        }
        node.debug('got valid player state');
        msg.payload = response;
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player volume and outputs.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @output changes msg.payload
  */
  function getPlayerVolumeV3 (node, msg, sonosPlayer) {
    const sonosFunction = 'get player volume';

    sonosPlayer.getVolume()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '' || isNaN(response)) {
          throw new Error('n-r-c-s-p: undefined player volume received', sonosFunction);
        }
        if (!Number.isInteger(response)) {
          throw new Error('n-r-c-s-p: invalid volume received', sonosFunction);
        }
        node.debug('got valid player volume');
        msg.payload = response;
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player muted state and outputs.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @output changes msg.payload
  */
  function getPlayerMutedV3 (node, msg, sonosPlayer) {
    const sonosFunction = 'get player muted state';

    sonosPlayer.getMuted()
      .then((response) => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined mute state received', sonosFunction);
        }
        node.debug('got valid mute state');
        msg.payload = response;
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player name and outputs.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @output changes msg.payload
  */
  function getPlayerNameV3 (node, msg, sonosPlayer) {
    const sonosFunction = 'get player name';
    sonosPlayer.getName()
      .then((response) => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined player name received', sonosFunction);
        }
        node.debug('got valid player name');
        msg.payload = response;
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player LED light status and outputs to payload.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @output changes msg.payload in On or Off
  */
  function getPlayerLedStatus (node, msg, sonosPlayer) {
    const sonosFunction = 'get player LED status';
    sonosPlayer.getLEDState()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined player properties received', sonosFunction);
        }
        // should be On or Off
        node.debug('got valid LED status');
        msg.payload = response;
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player properties and outputs to payload.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @output changes msg.payload
  */
  function getPlayerProperties (node, msg, sonosPlayer) {
    const sonosFunction = 'get player properties';
    sonosPlayer.deviceDescription()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined player properties received', sonosFunction);
        }
        node.debug('got valid group attributes');
        msg.payload = response;
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player current song, media and position and outputs.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @output msg: artist, title, albumArtURL, queueActivated, song, media and position
  * This command send serveral api requests and combines them.
  */
  function getPlayerSongMediaV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get songmedia';

    let artist = 'unknown'; // as default
    let title = 'unknown'; // as default
    let albumArtURL = '';

    let suppressWarnings = false; // default
    if (typeof msg.suppressWarnings === 'undefined' || msg.suppressWarnings === null ||
    (typeof msg.suppressWarnings === 'number' && isNaN(msg.suppressWarnings)) || msg.suppressWarnings === '') {
      suppressWarnings = false;
    } else {
      if (typeof msg.suppressWarnings === 'boolean') {
        suppressWarnings = msg.suppressWarnings;
      } else {
        throw new Error('n-r-c-s-p: msg.suppressWarning should be of type boolean', sonosFunction);
      }
    }
    sonosPlayer.currentTrack()
      .then(response => {
        msg.song = response;
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined current song received', sonosFunction);
        }
        // modify albumArtURL property
        if (typeof response.albumArtURI === 'undefined' || response.albumArtURI === null ||
          (typeof response.albumArtURI === 'number' && isNaN(response.albumArtURI)) || response.albumArtURI === '') {
          // TuneIn does not provide AlbumArtURL -so we continue
        } else {
          node.debug('got valid albumArtURI');
          const port = 1400;
          albumArtURL = 'http://' + sonosPlayer.host + ':' + port + response.albumArtURI;
        }
        // extract artist and title if available V2
        if (typeof response.artist === 'undefined' || response.artist === null ||
          (typeof response.artist === 'number' && isNaN(response.artist)) || response.artist === '') {
          // missing artist: TuneIn provides artist and title in title field
          if (typeof response.title === 'undefined' || response.title === null ||
              (typeof response.title === 'number' && isNaN(response.title)) || response.title === '') {
            if (!suppressWarnings) helper.nrcspWarning(node, sonosFunction, 'no artist, no title', 'received-> ' + JSON.stringify(response));
            msg.artist = artist;
            msg.title = title;
            return;
          } else {
            if (response.title.indexOf(' - ') > 0) {
              node.debug('could split data to artist and title');
              artist = response.title.split(' - ')[0];
              title = response.title.split(' - ')[1];
            } else {
              if (!suppressWarnings) helper.nrcspWarning(node, sonosFunction, 'invalid combination artist title received', 'received-> ' + JSON.stringify(response));
              msg.artist = artist;
              msg.title = response.title;
              return;
            }
          }
        } else {
          artist = response.artist;
          if (typeof response.title === 'undefined' || response.title === null ||
              (typeof response.title === 'number' && isNaN(response.title)) || response.title === '') {
            // title unknown
          } else {
            title = response.title;
            node.debug('got artist and title');
          }
        }
        node.debug('got valid song info');
        // msg.song = response already set before
        msg.albumArtURL = albumArtURL;
        msg.artist = artist;
        msg.title = title;
        return true;
      })
      .then(() => { return sonosPlayer.avTransportService().GetMediaInfo(); })
      .then((response) => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined media info received', sonosFunction);
        }
        if (typeof response.CurrentURI === 'undefined' || response.CurrentURI === null ||
          (typeof response.CurrentURI === 'number' && isNaN(response.CurrentURI)) || response.CurrentURI === '') {
          throw new Error('n-r-c-s-p: undefined CurrentURI received', sonosFunction);
        }
        const uri = response.CurrentURI;
        msg.queueActivated = (uri.startsWith('x-rincon-queue'));
        msg.media = response;
        return true;
      })
      .then(() => { return sonosPlayer.avTransportService().GetPositionInfo(); })
      .then((response) => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined position info received', sonosFunction);
        }
        msg.position = response;
        return true;
      })
      .then(() => {
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player current song and outputs.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
            msg.suppressWarnings  will suppress warning if exist and true
  * @param  {Object} sonosPlayer sonos player object
  * @output msg:  artist, title, albumArtURL and song
  */
  function getPlayerCurrentSongV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get current song';

    let artist = 'unknown'; // as default
    let title = 'unknown'; // as default
    let albumArtURL = '';

    let suppressWarnings = false; // default
    if (typeof msg.suppressWarnings === 'undefined' || msg.suppressWarnings === null ||
    (typeof msg.suppressWarnings === 'number' && isNaN(msg.suppressWarnings)) || msg.suppressWarnings === '') {
      suppressWarnings = false;
    } else {
      if (typeof msg.suppressWarnings === 'boolean') {
        suppressWarnings = msg.suppressWarnings;
      } else {
        throw new Error('n-r-c-s-p: msg.suppressWarning should be of type boolean', sonosFunction);
      }
    }

    sonosPlayer.currentTrack()
      .then(response => {
        msg.payload = response;
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined current song received', sonosFunction);
        }
        // modify albumArtURL property
        if (typeof response.albumArtURI === 'undefined' || response.albumArtURI === null ||
          (typeof response.albumArtURI === 'number' && isNaN(response.albumArtURI)) || response.albumArtURI === '') {
          // TuneIn does not provide AlbumArtURL -so we continure
        } else {
          node.debug('got valid albumArtURI');
          const port = 1400;
          albumArtURL = 'http://' + sonosPlayer.host + ':' + port + response.albumArtURI;
        }
        // extract artist and title if available V2
        if (typeof response.artist === 'undefined' || response.artist === null ||
          (typeof response.artist === 'number' && isNaN(response.artist)) || response.artist === '') {
          // missing artist: TuneIn provides artist and title in title field
          if (typeof response.title === 'undefined' || response.title === null ||
              (typeof response.title === 'number' && isNaN(response.title)) || response.title === '') {
            if (!suppressWarnings) helper.nrcspWarning(node, sonosFunction, 'no artist, no title', 'received-> ' + JSON.stringify(response));
            msg.artist = artist;
            msg.title = title;
            return;
          } else {
            if (response.title.indexOf(' - ') > 0) {
              node.debug('could split data to artist and title');
              artist = response.title.split(' - ')[0];
              title = response.title.split(' - ')[1];
            } else {
              if (!suppressWarnings) helper.nrcspWarning(node, sonosFunction, 'invalid combination artist title received', 'received-> ' + JSON.stringify(response));
              msg.artist = artist;
              msg.title = response.title;
              return;
            }
          }
        } else {
          artist = response.artist;
          if (typeof response.title === 'undefined' || response.title === null ||
              (typeof response.title === 'number' && isNaN(response.title)) || response.title === '') {
            // title unknown
          } else {
            title = response.title;
            node.debug('got artist and title');
          }
        }
        node.debug('got valid song info');
        // msg.payload = response already done above
        msg.albumArtURL = albumArtURL;
        msg.artist = artist;
        msg.title = title;
      })
      .then(() => {
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Get the media info and outputs.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @output msg: queueActivated, payload = media
  */
  function getMediaInfoV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get media info';

    sonosPlayer.avTransportService().GetMediaInfo()
      .then((response) => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined media info received', sonosFunction);
        }
        if (typeof response.CurrentURI === 'undefined' || response.CurrentURI === null ||
          (typeof response.CurrentURI === 'number' && isNaN(response.CurrentURI)) || response.CurrentURI === '') {
          throw new Error('n-r-c-s-p: undefined CurrentURI received', sonosFunction);
        }
        const uri = response.CurrentURI;
        msg.queueActivated = (uri.startsWith('x-rincon-queue'));
        msg.payload = response;
        return true;
      })
      .then(() => {
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Get the position info and outputs.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @output msg: payload = position
  */
  function getPositionInfoV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get position info';

    sonosPlayer.avTransportService().GetPositionInfo()
      .then((response) => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined position info received', sonosFunction);
        }
        msg.payload = response;
        return true;
      })
      .then(() => {
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /**  Get list of all My Sonos items.
  * @param  {Object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * change msg.payload to array of all My Sonos items
  */
  function getMySonosAll (node, msg, sonosPlayer) {
    // get list of My Sonos items
    const sonosFunction = 'get my sonos all';
    sonosPlayer.getFavorites()
      .then((response) => {
        // validate response
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined getFavorites response received');
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          throw new Error('n-r-c-s-p: undefined favorite list received');
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list');
        }
        const list = response.items;
        if (list.length === 0) {
          throw new Error('n-r-c-s-p: no my sonos items found');
        }
        msg.payload = list;
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Test SONOS player: reachable true/false
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @output changes msg.payload to boolean true otherwise false
  */
  function testConnected (node, msg, sonosPlayer) {
    const sonosFunction = 'test connected';
    sonosPlayer.getCurrentState()
      .then((response) => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined player state received', sonosFunction);
        }
        node.debug('player reachable');
        msg.payload = true;
        helper.nrcspSuccess(node, msg, sonosFunction);

        return true;
      })
      .catch(error => {
        node.debug('test command - error ignored' + JSON.stringify(error));
        node.status({ fill: 'green', shape: 'dot', text: 'test command - error ingnored' });
        msg.payload = false;
        node.send(msg);
      });
  }

  /** getGroupsInfo: get all available data about the topology = group
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @output {Object} payload topology and group current group information
  */
  function getGroupsInfo (node, msg, sonosPlayer) {
    const sonosFunction = 'get groups info';

    sonosPlayer.getAllGroups()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined all group information received', sonosFunction);
        }
        node.debug('got valid all group info');
        msg.payload = response;
        return true;
      })
      .then(() => { return sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes(); })
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined zone group attributes received', sonosFunction);
        }
        node.debug('got zone group attribures info');
        msg.sonosGroup = response;
        if (typeof response.CurrentZoneGroupName === 'undefined' || response.CurrentZoneGroupName === null ||
          (typeof response.CurrentZoneGroupName === 'number' && isNaN(response.CurrentZoneGroupName))) {
          throw new Error('n-r-c-s-p: undefined CurrentZoneGroupName received', sonosFunction);
        }
        if (response.CurrentZoneGroupName === '') {
          msg.role = 'client';
        } else if (response.CurrentZoneGroupName.includes('+')) {
          msg.role = 'master';
        } else {
          msg.role = 'independent';
        }
        helper.nrcspSuccess(node, msg, sonosFunction);
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }
  /** getEQinfo: get eqinfo eg NightMode, Speech Enhancement and SubGain
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @output {Object} payload with nightMode, SpeechEnhancement, subGain
  */
  function getEQInfo (node, msg, sonosPlayer) {
    const sonosFunction = 'get eq info';
    const playerWithTV = ['Sonos Beam', 'Sonos Playbar', 'Sonos Playbase'];

    sonosPlayer.deviceDescription()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
            (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined device description received', sonosFunction);
        }
        if (typeof response.modelName === 'undefined' || response.modelName === null ||
            (typeof response.modelName === 'number' && isNaN(response.modelName)) || response.modelName === '') {
          throw new Error('n-r-c-s-p: undefined model name received', sonosFunction);
        }
        if (!playerWithTV.includes(response.modelName)) {
          throw new Error('n-r-c-s-p: your player does not support TV', sonosFunction);
        }
        msg.payload = response;
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** labNewFunction: sandbox to test new commands
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer sonos player object
  * @output
  */
  function labNewFunction (node, msg, sonosPlayer) {

  }

  RED.nodes.registerType('sonos-get-status', SonosGetStatusNode);
};
