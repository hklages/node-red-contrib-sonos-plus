const NrcspHelper = require('./Helper.js');
const NrcspSonos = require('./Sonos-Commands.js');

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

    if (!((NrcspHelper.isValidProperty(configNode, ['ipaddress']) && NrcspHelper.REGEX_IP.test(configNode.ipaddress)) ||
      (NrcspHelper.isValidProperty(configNode, ['serialnum']) && NrcspHelper.REGEX_SERIAL.test(configNode.serialnum)))) {
      NrcspHelper.failure(node, null, new Error('n-r-c-s-p: invalid config node - missing ip or serial number'), sonosFunction);
      return;
    }

    // clear node status
    node.status({});
    // subscribe and handle input message
    node.on('input', function (msg) {
      node.debug('node - msg received');

      // if ip address exist use it or get it via discovery based on serialNum
      if (NrcspHelper.isValidProperty(configNode, ['ipaddress']) && NrcspHelper.REGEX_IP.test(configNode.ipaddress)) {
        node.debug('using IP address of config node');
        processInputMsg(node, msg, configNode.ipaddress, configNode.serialnum);
      } else {
        // have to get ip address via disovery with serial numbers
        NrcspHelper.warning(node, sonosFunction, 'No ip address', 'Providing ip address is recommended');
        if (NrcspHelper.isValidProperty(configNode, ['serialnum']) && NrcspHelper.REGEX_SERIAL.test(configNode.serialnum)) {
          NrcspHelper.discoverSonosPlayerBySerial(node, configNode.serialnum, (err, ipAddress) => {
            if (err) {
              NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: discovery failed'), sonosFunction);
              return;
            }
            if (ipAddress === null) {
              NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: could not find any player by serial'), sonosFunction);
            } else {
              // setting of nodestatus is done in following call handelIpuntMessage
              node.debug('Found sonos player');
              processInputMsg(node, msg, ipAddress, configNode.serialnum);
            }
          });
        } else {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: invalid config node - invalid serial'), sonosFunction);
        }
      }
    });
  }

  /**  Validate sonos player and input message then dispatch further.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {string} ipaddress IP address of sonos player
  */
  function processInputMsg (node, msg, ipaddress) {
    const sonosFunction = 'handle input msg';
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);

    if (!NrcspHelper.isTruthyAndNotEmptyString(sonosPlayer)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined sonos player'), sonosFunction);
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (!NrcspHelper.isTruthyAndNotEmptyString(msg.payload)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined payload', sonosFunction));
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
    } else if (command === 'get_groups') {
      getGroupsInfo(node, msg, sonosPlayer);
    } else if (command === 'get_eq') {
      getEQ(node, msg, sonosPlayer);
    } else if (command === 'get_crossfade') {
      getCrossfadeMode(node, msg, sonosPlayer);
    } else if (command === 'get_loudness') {
      getLoudnessMode(node, msg, sonosPlayer);
    } else if (command === 'get_sleeptimer') {
      getRemainingSleepTimerDuration(node, msg, sonosPlayer);
    } else if (command === 'test_connected') {
      testConnected(node, msg, sonosPlayer);
    // depreciated commands
    } else if (command === 'get_mysonos') {
      getMySonosAll(node, msg, sonosPlayer);
    } else if (command === 'lab_test') {
      labtest(node, msg, sonosPlayer);
    } else {
      NrcspHelper.warning(node, sonosFunction, 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(command));
    }
  }

  // -----------------------------------------------------
  // Commands
  // -----------------------------------------------------

  /** Get the SONOS basic data and output to msg.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer sonos player object
  * @output msg: state, volume, volumeNormalized, muted, name, group
  * This command will send several api calls and combine the results.
  */
  function getBasicsV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get basics';
    let state; let volume; let normalizedVolume; let muted; let sonosName; let sonosGroup;

    sonosPlayer.getCurrentState()
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player state received');
        }
        state = response;
        return true;
      })
      .then(() => { return sonosPlayer.getVolume(); })
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player volume received');
        }
        volume = response;
        normalizedVolume = response / 100.0;
        return true;
      })
      .then(() => { return sonosPlayer.getMuted(); })
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player muted state received');
        }
        muted = response;
        return true;
      })
      .then(() => { return sonosPlayer.getName(); })
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player name received');
        }
        sonosName = response;
        return true;
      })
      .then(() => { return sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes(); })
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined zone group attributes received');
        }
        sonosGroup = response;
        return true;
      })
      .then(() => {
        msg.state = state; msg.volume = volume; msg.volumeNormalized = normalizedVolume; msg.muted = muted; msg.name = sonosName; msg.group = sonosGroup;
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player state and outputs.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer sonos player object
  * @output changes msg.payload
  */
  function getPlayerStateV3 (node, msg, sonosPlayer) {
    const sonosFunction = 'get player state';

    sonosPlayer.getCurrentState()
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player state received');
        }
        node.debug('got valid player state');
        msg.payload = response;
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player volume and outputs.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer sonos player object
  * @output changes msg.payload
  */
  function getPlayerVolumeV3 (node, msg, sonosPlayer) {
    const sonosFunction = 'get player volume';

    sonosPlayer.getVolume()
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response) || isNaN(response)) {
          throw new Error('n-r-c-s-p: undefined player volume received');
        }
        if (!Number.isInteger(response)) {
          throw new Error('n-r-c-s-p: invalid volume received');
        }
        node.debug('got valid player volume');
        msg.payload = response;
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player muted state and outputs.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer sonos player object
  * @output changes msg.payload
  */
  function getPlayerMutedV3 (node, msg, sonosPlayer) {
    const sonosFunction = 'get player muted state';

    sonosPlayer.getMuted()
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined mute state received');
        }
        node.debug('got valid mute state');
        msg.payload = response;
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player name and outputs.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer sonos player object
  * @output changes msg.payload
  */
  function getPlayerNameV3 (node, msg, sonosPlayer) {
    const sonosFunction = 'get player name';
    sonosPlayer.getName()
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player name received');
        }
        node.debug('got valid player name');
        msg.payload = response;
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player LED light status and outputs to payload.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer sonos player object
  * @output changes msg.payload in On or Off
  */
  function getPlayerLedStatus (node, msg, sonosPlayer) {
    const sonosFunction = 'get LED status';
    sonosPlayer.getLEDState()
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player properties received');
        }
        // should be On or Off
        node.debug('got valid LED status');
        msg.payload = response;
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player properties and outputs to payload.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer sonos player object
  * @output changes msg.payload
  */
  function getPlayerProperties (node, msg, sonosPlayer) {
    const sonosFunction = 'get player properties';
    sonosPlayer.deviceDescription()
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player properties received');
        }
        node.debug('got valid group attributes');
        msg.payload = response;
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player current song, media and position and outputs.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer sonos player object
  * @output msg: artist, title, albumArtURL, queueActivated, song, media and position
  * This command send serveral api requests and combines them.
  */
  function getPlayerSongMediaV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get songmedia';

    let artist = 'unknown'; // as default
    let title = 'unknown'; // as default
    let albumArtURL = '';

    let suppressWarnings = false; // default
    if (!NrcspHelper.isTruthyAndNotEmptyString(msg.suppressWarnings)) {
      suppressWarnings = false;
    } else {
      if (typeof msg.suppressWarnings === 'boolean') {
        suppressWarnings = msg.suppressWarnings;
      } else {
        NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: msg.suppressWarning should be of type boolean'), sonosFunction);
        return;
      }
    }
    sonosPlayer.currentTrack()
      .then((response) => {
        msg.song = response;
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined current song received');
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
            if (!suppressWarnings) NrcspHelper.warning(node, sonosFunction, 'no artist, no title', 'received-> ' + JSON.stringify(response));
            msg.artist = artist;
            msg.title = title;
            return;
          } else {
            if (response.title.indexOf(' - ') > 0) {
              node.debug('could split data to artist and title');
              artist = response.title.split(' - ')[0];
              title = response.title.split(' - ')[1];
            } else {
              if (!suppressWarnings) NrcspHelper.warning(node, sonosFunction, 'invalid combination artist title received', 'received-> ' + JSON.stringify(response));
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
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined media info received');
        }
        if (typeof response.CurrentURI === 'undefined' || response.CurrentURI === null ||
          (typeof response.CurrentURI === 'number' && isNaN(response.CurrentURI)) || response.CurrentURI === '') {
          throw new Error('n-r-c-s-p: undefined CurrentURI received');
        }
        const uri = response.CurrentURI;
        msg.queueActivated = (uri.startsWith('x-rincon-queue'));
        if (uri.startsWith('x-sonosapi-stream:') && uri.includes('sid=254')) {
          const end = uri.indexOf('?sid=254');
          const start = 'x-sonosapi-stream:'.length;
          msg.radioId = uri.substring(start, end);
        }
        msg.media = response;
        return true;
      })
      .then(() => { return sonosPlayer.avTransportService().GetPositionInfo(); })
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined position info received');
        }
        msg.position = response;
        return true;
      })
      .then(() => {
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** Get the sonos player current song and outputs.
  * @param  {object} node current node
  * @param  {object} msg incoming message
            msg.suppressWarnings  will suppress warning if exist and true
  * @param  {object} sonosPlayer sonos player object
  * @output msg:  artist, title, albumArtURL and song
  */
  function getPlayerCurrentSongV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get current song';

    let artist = 'unknown'; // as default
    let title = 'unknown'; // as default
    let albumArtURL = '';

    let suppressWarnings = false; // default
    if (!NrcspHelper.isTruthyAndNotEmptyString(msg.suppressWarnings)) {
      suppressWarnings = false;
    } else {
      if (typeof msg.suppressWarnings === 'boolean') {
        suppressWarnings = msg.suppressWarnings;
      } else {
        NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: msg.suppressWarning should be of type boolean'), sonosFunction);
        return;
      }
    }

    sonosPlayer.currentTrack()
      .then((response) => {
        msg.payload = response;
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined current song received');
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
            if (!suppressWarnings) NrcspHelper.warning(node, sonosFunction, 'no artist, no title', 'received-> ' + JSON.stringify(response));
            msg.artist = artist;
            msg.title = title;
            return;
          } else {
            if (response.title.indexOf(' - ') > 0) {
              node.debug('could split data to artist and title');
              artist = response.title.split(' - ')[0];
              title = response.title.split(' - ')[1];
            } else {
              if (!suppressWarnings) NrcspHelper.warning(node, sonosFunction, 'invalid combination artist title received', 'received-> ' + JSON.stringify(response));
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
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** Get the media info and outputs.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer sonos player object
  * @output msg: queueActivated, payload = media
  */
  function getMediaInfoV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get media info';

    sonosPlayer.avTransportService().GetMediaInfo()
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined media info received');
        }
        if (typeof response.CurrentURI === 'undefined' || response.CurrentURI === null ||
          (typeof response.CurrentURI === 'number' && isNaN(response.CurrentURI)) || response.CurrentURI === '') {
          throw new Error('n-r-c-s-p: undefined CurrentURI received');
        }
        const uri = response.CurrentURI;
        msg.queueActivated = (uri.startsWith('x-rincon-queue'));
        if (uri.startsWith('x-sonosapi-stream:') && uri.includes('sid=254')) {
          const end = uri.indexOf('?sid=254');
          const start = 'x-sonosapi-stream:'.length;
          msg.radioId = uri.substring(start, end);
        }
        msg.payload = response;
        return true;
      })
      .then(() => {
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** Get the position info and outputs.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer sonos player object
  * @output msg: payload = position
  */
  function getPositionInfoV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get position info';

    sonosPlayer.avTransportService().GetPositionInfo()
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined position info received');
        }
        msg.payload = response;
        return true;
      })
      .then(() => {
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  // depreciated command

  /**  Get list of all My Sonos items.
  * @param  {object} node current node
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
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
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
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** Test SONOS player: reachable true/false
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer sonos player object
  * @output changes msg.payload to boolean true otherwise false
  */
  function testConnected (node, msg, sonosPlayer) {
    const sonosFunction = 'test is player reachable';
    sonosPlayer.getCurrentState()
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player state received');
        }
        node.debug('player reachable');
        msg.payload = true;
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => {
        node.debug('test command - error ignored' + JSON.stringify(error));
        let msgShort = 'no further information';
        if (NrcspHelper.isTruthyAndNotEmptyString(error.code)) {
          if (error.code === 'ECONNREFUSED') {
            msgShort = 'can not connect to player - refused';
          } else if (error.code === 'EHOSTUNREACH') {
            msgShort = 'can not connect to player- unreach';
          } else if (error.code === 'ETIMEDOUT') {
            msgShort = 'can not connect to player- time out';
          }
        }
        node.status({ fill: 'green', shape: 'dot', text: 'test command - ' });
        msg.payload = false;
        msg.info = msgShort;
        node.send(msg);
      });
  }

  /** getGroupsInfo: get all available data about the topology = group
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer sonos player object
  * @output {object} payload topology and group current group information
  */
  function getGroupsInfo (node, msg, sonosPlayer) {
    const sonosFunction = 'get groups info';

    sonosPlayer.getAllGroups()
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined all group information received');
        }
        node.debug('got valid all group info');
        msg.payload = response;
        return true;
      })
      .then(() => { return sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes(); })
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined zone group attributes received');
        }
        node.debug('got zone group attribures info');
        msg.sonosGroup = response;
        if (typeof response.CurrentZoneGroupName === 'undefined' || response.CurrentZoneGroupName === null ||
          (typeof response.CurrentZoneGroupName === 'number' && isNaN(response.CurrentZoneGroupName))) {
          throw new Error('n-r-c-s-p: undefined CurrentZoneGroupName received');
        }
        if (response.CurrentZoneGroupName === '') {
          msg.role = 'client';
        } else if (response.CurrentZoneGroupName.includes('+')) {
          msg.role = 'master';
        } else {
          msg.role = 'independent';
        }
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** Get EQ information (for specified EQTypes eg NightMode, DialogLevel (akak Speech Enhancement) and SubGain (aka sub Level)) for player with TV-
  * @param  {object} node current node
  * @param  {object} msg incoming message
  *                 msg.topic specifies EQtype
  * @param  {object} sonosPlayer sonos player object
  * @output {object} payload with nightMode, SpeechEnhancement, subGain
  */
  function getEQ (node, msg, sonosPlayer) {
    const sonosFunction = 'get EQ';

    const actionParameter = NrcspSonos.ACTIONS_TEMPLATES.GetEQ;
    actionParameter.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;

    // validate msg.topic
    if (!NrcspHelper.isTruthyAndNotEmptyString(msg.topic)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    if (!NrcspSonos.ACTIONS_TEMPLATES.SetEQ.eqTypeValues.includes(msg.topic)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: invalid topic. Should be one of ' + NrcspSonos.ACTIONS_TEMPLATES.SetEQ.eqTypeValues.toString()), sonosFunction);
      return;
    }
    const eqType = msg.topic;

    node.debug(JSON.stringify(actionParameter));
    actionParameter.args.EQType = eqType;

    sonosPlayer.deviceDescription()
      .then((response) => { // ensure that SONOS player has TV mode
        if (!NrcspHelper.isValidPropertyNotEmptyString(response, ['modelName'])) {
          throw new Error('n-r-c-s-p: undefined model name received');
        }
        if (!NrcspHelper.PLAYER_WITH_TV.includes(response.modelName)) {
          throw new Error('n-r-c-s-p: your player does not support TV');
        }
        return true;
      })
      .then(() => { // send request to SONOS player
        const baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
        return NrcspSonos.getCmd(baseUrl, 'GetEQ');
      })
      .then((result) => {
        if (eqType === 'SubGain') {
          msg.payload = result;
        } else {
          msg.payload = (result === '1' ? 'On' : 'Off');
        }
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Get current crossfade mode.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * @output {String} msg.payload On Off
  */
  function getCrossfadeMode (node, msg, sonosPlayer) {
    const sonosFunction = 'get crossfade mode';
    const baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    NrcspSonos.getCmd(baseUrl, 'GetCrossfadeMode')
      .then((result) => {
        msg.payload = (result === '1' ? 'On' : 'Off');
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Get current loudness mode.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * @output {String} msg.payload On Off
  */
  function getLoudnessMode (node, msg, sonosPlayer) {
    const sonosFunction = 'get loudness mode';
    const baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    NrcspSonos.getCmd(baseUrl, 'GetLoudness')
      .then((result) => {
        msg.payload = (result === '1' ? 'On' : 'Off');
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Get remaining sleep timer duration.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * @output {String} msg.payload On Off
  */
  function getRemainingSleepTimerDuration (node, msg, sonosPlayer) {
    const sonosFunction = 'get remainig sleep timer';
    const baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    NrcspSonos.getCmd(baseUrl, 'GetRemainingSleepTimerDuration')
      .then((result) => {
        msg.payload = (result === '' ? 'no time set' : result);
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** sandbox to test new commands
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer sonos player object
  * @output
  */
  function labtest (node, msg, sonosPlayer) {
    const sonosFunction = 'labtest';
    return sonosFunction;
  }

  RED.nodes.registerType('sonos-get-status', SonosGetStatusNode);
};
