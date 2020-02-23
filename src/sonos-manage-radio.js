const NrcspHelper = require('./Helper.js');

module.exports = function (RED) {
  'use strict';

  /**  Create Manage Radio Node and subscribe to messages.
  * @param  {object} config current node configuration data
  */
  function SonosManageRadioNode (config) {
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

  // ------------------------------------------------------------------------------------

  /**  Validate sonos player and input message then dispatch further.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {string} ipaddress IP address of sonos player
  */
  function processInputMsg (node, msg, ipaddress) {
    // get sonos player object
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);

    const sonosFunction = 'handle input msg';

    if (typeof sonosPlayer === 'undefined' || sonosPlayer === null ||
      (typeof sonosPlayer === 'number' && isNaN(sonosPlayer)) || sonosPlayer === '') {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined sonos player'), sonosFunction);
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (!NrcspHelper.isValidPropertyNotEmptyString(msg, ['payload'])) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined payload', sonosFunction));
      return;
    }

    // dispatch (dont add msg.topic because may not exist and is not checked)
    let command = String(msg.payload);
    command = command.toLowerCase();

    // dispatch
    if (command === 'play_tunein') {
      playTuneIn(node, msg, sonosPlayer);
    } else if (command === 'play_httpradio') {
      playHttpRadio(node, msg, sonosPlayer);
    } else if (command === 'play_mysonos') {
      playMySonos(node, msg, sonosPlayer);
    } else if (command === 'get_mysonos') {
      getMySonosStations(node, msg, sonosPlayer);
    } else {
      NrcspHelper.warning(node, sonosFunction, 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(command));
    }
  }

  // -----------------------------------------------------
  // Commands
  // -----------------------------------------------------

  /**  Play TuneIn radio station (via simple TuneIn Radio id) and optional set volume.
  * @param  {object} node current node
  * @param  {object} msg incoming message - uses volume if provided
  *           topic TuneIn radio id - example s111111
  *           volume  optional volume in range 1 .. 99
  * @param  {object} sonosPlayer Sonos Player
  * @output Success msg, no modification
  */
  function playTuneIn (node, msg, sonosPlayer) {
    const sonosFunction = 'play tunein';

    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined prime playlist'), sonosFunction);
      return;
    }

    if (NrcspHelper.REGEX_RADIO_ID.test(msg.topic)) {
      sonosPlayer.playTuneinRadio(msg.topic)
        .then((response) => { // optionally change volume
          // validate volume: integer, betweent 1 and 99
          node.debug('response: ' + JSON.stringify(response));

          if (typeof msg.volume === 'undefined' || msg.volume === null ||
          (typeof msg.volume === 'number' && isNaN(msg.volume)) || msg.volume === '') {
            // do NOT change volume - just return
            return true;
          }
          const newVolume = parseInt(msg.volume);
          if (Number.isInteger(newVolume)) {
            if (newVolume > 0 && newVolume < 100) {
              // change volume
              node.debug('msg.volume is in range 1...99: ' + newVolume);
              return sonosPlayer.setVolume(newVolume);
            } else {
              node.debug('msg.volume is not in range: ' + newVolume);
              throw new Error('n-r-c-s-p: msg.volume is out of range 1...99: ' + newVolume);
            }
          } else {
            node.debug('msg.volume is not number');
            throw new Error('n-r-c-s-p: msg.volume is not a number: ' + JSON.stringify(msg.volume));
          }
        })
        .then(() => {
          NrcspHelper.success(node, msg, sonosFunction);
          return true;
        })
        .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
    } else {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: invalid TuneIn radio id: ' + JSON.stringify(msg.topic)), sonosFunction);
    }
  }

  /**  Play http radio from internet.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  *                 topic: valid http address of radio MP3Stream
  *                 volume: volume 1 .. 99
  * @param  {object} sonosPlayer Sonos Player
  * @output msg with msg.payload = true
  */
  function playHttpRadio (node, msg, sonosPlayer) {
    const sonosFunction = 'play http radio';

    // validate msg.topic
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
      return;
    }

    if (!msg.topic.startsWith('http')) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: topic should start with http', sonosFunction));
      return;
    }

    sonosPlayer.setAVTransportURI(msg.topic)
      .then(() => { // optionally change volume
        // validate volume: integer, betweent 1 and 99
        if (typeof msg.volume === 'undefined' || msg.volume === null ||
        (typeof msg.volume === 'number' && isNaN(msg.volume)) || msg.volume === '') {
          // do NOT change volume - just return
          return true;
        }
        const newVolume = parseInt(msg.volume);
        if (Number.isInteger(newVolume)) {
          if (newVolume > 0 && newVolume < 100) {
            // change volume
            node.debug('msg.volume is in range 1...99: ' + newVolume);
            return sonosPlayer.setVolume(newVolume);
          } else {
            node.debug('msg.volume is not in range: ' + newVolume);
            throw new Error('n-r-c-s-p: msg.volume is out of range 1...99: ' + newVolume);
          }
        } else {
          node.debug('msg.volume is not number');
          throw new Error('n-r-c-s-p: msg.volume is not a number: ' + JSON.stringify(msg.volume));
        }
      })
      .then(() => {
        msg.payload = true;
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Play a specific My Sonos station (must be TuneIn, AmazonPrime, MP3 station), start playing and optionally set volume.
  * @param  {object} node current node
  * @param  {object} msg incoming message
                topic search string
                volume volume to be used
  * @param  {object} sonosPlayer Sonos Player
  * @output msg.payload is stationTitle
  */
  function playMySonos (node, msg, sonosPlayer) {
    const sonosFunction = 'play mysonos';

    // validate msg.topic
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }

    let stationTitleFinal = 'unknown';

    sonosPlayer.getFavorites()
      .then(response => {
        // create array of valid stations and return

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

        // create stationArray with all valid items and source field: TuneIn, AmazonPrime, MP3 station
        const TUNEIN_PREFIX = 'x-sonosapi-stream:';
        const AMAZON_PREFIX = 'x-sonosapi-radio:';
        const MP3_PREFIX = 'x-rincon-mp3radio:';
        let stationUri;
        let stationTitle;
        let ingnoredItems = 0;
        const stationArray = [];
        for (let i = 0; i < response.items.length; i++) {
          if (typeof response.items[i].uri === 'undefined' || response.items[i].uri === null ||
            (typeof response.items[i].uri === 'number' && isNaN(response.items[i].uri)) || response.items[i].uri === '') {
            // uri not defined - example: Pocket Cast --- ignore!
            node.debug('uri not define - this record is ignored' + String(i) + JSON.stringify(response));
            ingnoredItems++;
          } else {
            stationUri = response.items[i].uri;

            if (typeof response.items[i].title === 'undefined' || response.items[i].title === null ||
              (typeof response.items[i].title === 'number' && isNaN(response.items[i].title)) || response.items[i].title === '') {
              throw new Error('n-r-c-s-p: undefined title at position ' + String(i));
            }
            stationTitle = response.items[i].title;
            if (stationUri.startsWith(TUNEIN_PREFIX)) {
              stationArray.push({ title: stationTitle, uri: stationUri, source: 'TuneIn' });
            }
            if (stationUri.startsWith(AMAZON_PREFIX)) {
              stationArray.push({ title: stationTitle, uri: stationUri, source: 'AmazonPrime' });
            }
            if (stationUri.startsWith(MP3_PREFIX)) {
              stationArray.push({ title: stationTitle, uri: stationUri, source: 'MP3Radio' });
            }
          }
        }

        if (stationArray.length === 0) {
          throw new Error('n-r-c-s-p: no TuneIn/Amazon/MP3Radio station in My Sonos');
        }
        if (ingnoredItems > 0) {
          NrcspHelper.warning(node, sonosFunction, 'Some My Sonos items do not contain an uri', 'Count: ' + String(ingnoredItems));
        }
        node.debug('successfully extracted relevant station list');
        return stationArray;
      })
      .then((stations) => {
        // lookup topic in stations and play radio station - first match counts
        // set also stationTitleFinal
        for (let i = 0; i < stations.length; i++) {
          if (((stations[i].title).indexOf(msg.topic)) >= 0) {
            // play radio station - currently implemented for TuneIn, AmazonPrime, MP3Stream
            if (stations[i].source === 'TuneIn' || stations[i].source === 'AmazonPrime' || stations[i].source === 'MP3Stream') {
              stationTitleFinal = stations[i].title;
              return sonosPlayer.setAVTransportURI(stations[i].uri);
            } else {
              throw new Error('n-r-c-s-p: Neither tuneIn nor amazon nor mp3 radio');
            }
          }
        }
        // did not find matching stations
        throw new Error('n-r-c-s-p: topic not found in My Sonos list');
      })
      .then(() => { // optionally modify change volume
        if (typeof msg.volume === 'undefined' || msg.volume === null ||
        (typeof msg.volume === 'number' && isNaN(msg.volume)) || msg.volume === '') {
          // dont change volume
        } else {
          const newVolume = parseInt(msg.volume);
          if (Number.isInteger(newVolume)) {
            if (newVolume > 0 && newVolume < 100) {
              // play and change volume
              node.debug('msg.volume is in range 1...99: ' + newVolume);
              return sonosPlayer.setVolume(msg.volume);
            } else {
              node.debug('msg.volume is not in range: ' + newVolume);
              throw new Error('n-r-c-s-p: msg.volume is out of range 1...99: ' + newVolume);
            }
          } else {
            node.debug('msg.volume is not number');
            throw new Error('n-r-c-s-p: msg.volume is not a number: ' + JSON.stringify(msg.volume));
          }
        }
      })
      .then(() => {
        msg.payload = stationTitleFinal;
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Get list of My Sonos radio station (only TuneIn, AmazonPrime, MP3 stations).
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * change msg.payload to current array of my Sonos radio stations
  */
  function getMySonosStations (node, msg, sonosPlayer) {
    // get list of My Sonos stations
    const sonosFunction = 'get my sonos stations';

    sonosPlayer.getFavorites()
      .then(response => {
        // create array of valid stations and return

        // validate response
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined getFavorites response received');
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          node.debug('response->' + JSON.stringify(response));
          throw new Error('n-r-c-s-p: undefined favorite list received');
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list');
        }

        // create stationArray with all valid items and source field: TuneIn, AmazonPrime, MP3 station
        const TUNEIN_PREFIX = 'x-sonosapi-stream:';
        const AMAZON_PREFIX = 'x-sonosapi-radio:';
        const MP3_PREFIX = 'x-rincon-mp3radio:';
        let radioId;
        let stationUri;
        let stationTitle;
        let ingnoredItems = 0;
        const stationArray = [];
        for (let i = 0; i < response.items.length; i++) {
          if (typeof response.items[i].uri === 'undefined' || response.items[i].uri === null ||
            (typeof response.items[i].uri === 'number' && isNaN(response.items[i].uri)) || response.items[i].uri === '') {
            // uri not defined - example: Pocket Cast --- ignore!
            node.debug('uri not define - this record is ignored' + String(i) + JSON.stringify(response));
            ingnoredItems++;
          } else {
            stationUri = response.items[i].uri;

            if (typeof response.items[i].title === 'undefined' || response.items[i].title === null ||
              (typeof response.items[i].title === 'number' && isNaN(response.items[i].title)) || response.items[i].title === '') {
              throw new Error('n-r-c-s-p: undefined title at position ' + String(i));
            }
            stationTitle = response.items[i].title;
            if (stationUri.startsWith(TUNEIN_PREFIX)) {
            // get stationId and logo
              radioId = stationUri.split('?')[0];
              radioId = radioId.substr(TUNEIN_PREFIX.length);
              let stationLogo;
              if (typeof response.items[i].albumArtURI === 'undefined' || response.items[i].albumArtURI === null ||
                (typeof response.items[i].albumArtURI === 'number' && isNaN(response.items[i].albumArtURI)) || response.items[i].albumArtURI === '') {
                stationLogo = '';
              } else {
                stationLogo = response.items[i].albumArtURI;
              }
              stationArray.push({ title: stationTitle, radioId: radioId, uri: stationUri, logo: stationLogo, source: 'TuneIn' });
            }
            if (stationUri.startsWith(AMAZON_PREFIX)) {
              stationArray.push({ title: stationTitle, uri: stationUri, source: 'AmazonPrime' });
            }
            if (stationUri.startsWith(MP3_PREFIX)) {
              stationArray.push({ title: stationTitle, uri: stationUri, source: 'MP3Radio' });
            }
          }
        }

        if (stationArray.length === 0) {
          throw new Error('n-r-c-s-p: no TuneIn/Amazon/MP3Radio station in My Sonos');
        }
        if (ingnoredItems > 0) {
          NrcspHelper.warning(node, sonosFunction, 'Some My Sonos items do not contain an uri', 'Count: ' + String(ingnoredItems));
        }
        node.debug('successfully extracted relevant station list');
        return stationArray;
      })
      .then((stations) => {
        msg.payload = stations;
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  RED.nodes.registerType('sonos-manage-radio', SonosManageRadioNode);
};
