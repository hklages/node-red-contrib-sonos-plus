const SonosHelper = require('./SonosHelper.js');
const helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosManageRadioNode (config) {
    /**  Create Manage Radio Node and subscribe to messages
    * @param  {object} config current node configuration data
    */

    RED.nodes.createNode(this, config);
    const sonosFunction = 'create node manage radio';
    // validate config node. if valid then set status and subscribe to messages
    const node = this;
    const configNode = RED.nodes.getNode(config.confignode);
    const isValid = helper.validateConfigNodeV3(configNode);
    if (isValid) {
      // clear node status
      node.status({});
      // subscribe and handle input message
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
          helper.showError(node, msg, new Error('n-r-c-s-p: Please modify config node'), sonosFunction, 'invalid configNode');
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

  // ------------------------------------------------------------------------------------

  /**  Validate sonos player and input message then dispatch further.
  * @param  {Object} node current node
  * @param  {object} msg incoming message
  * @param  {string} ipaddress IP address of sonos player
  */
  function handleInputMsg (node, msg, ipaddress) {
    // get sonos player object
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    const sonosFunction = 'handle input msg';
    if (typeof sonosPlayer === 'undefined' || sonosPlayer === null ||
      (typeof sonosPlayer === 'number' && isNaN(sonosPlayer)) || sonosPlayer === '') {
      helper.showError(node, msg, new Error('n-r-c-s-p: Check configuration'), sonosFunction, 'undefined sonos player.');
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (typeof msg.payload === 'undefined' || msg.payload === null ||
      (typeof msg.payload === 'number' && isNaN(msg.payload)) || msg.payload === '') {
      helper.showError(node, msg, new Error('n-r-c-s-p: undefined payload ' + JSON.stringify(msg)), sonosFunction, 'undefined payload');
      return;
    }

    // dispatch (dont add msg.topic because may not exist and is not checked)
    // TODO use command without parameter and get topic in subprocedure
    const commandWithParam = {
      cmd: (String(msg.payload)).toLowerCase(),
      parameter: ''
    };
    if (commandWithParam.cmd === 'play_mysonos') {
      if (typeof msg.topic === 'undefined' || msg.topic === null ||
        (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
        helper.showError(node, msg, new Error('n-r-c-s-p: undefined topic ' + JSON.stringify(msg)), sonosFunction, 'undefined topic');
        return;
      }
      commandWithParam.parameter = String(msg.topic);
      playMySonos(node, msg, sonosPlayer, commandWithParam);
    } else if (commandWithParam.cmd === 'play_tunein') {
      if (typeof msg.topic === 'undefined' || msg.topic === null ||
        (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
        helper.showError(node, msg, new Error('n-r-c-s-p: undefined topic ' + JSON.stringify(msg)), sonosFunction, 'undefined topic');
        return;
      }
      commandWithParam.parameter = String(msg.topic);
      playTuneIn(node, msg, sonosPlayer, commandWithParam);
    } else if (commandWithParam.cmd === 'get_mysonos') {
      getMySonosStations(node, msg, sonosPlayer);
    } else if (commandWithParam.cmd === 'get_mysonosall') {
      getMySonosAll(node, msg, sonosPlayer);
    } else {
      helper.showWarning(node, sonosFunction, 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(commandWithParam));
    }
  }

  // -----------------------------------------------------------------------------

  /**  Activate TuneIn radio station (via simple TuneIn Radio id) and optional set volume.
  * @param  {Object} node current node
  * @param  {object} msg incoming message - uses volume if provided
  * @param  {object} sonosPlayer Sonos Player
  * @param  {object} commandObject command with function and parameter
  */
  function playTuneIn (node, msg, sonosPlayer, commandObject) {
    const reg = new RegExp('^[s][0-9]+$'); // example s11111
    const sonosFunction = 'play tunein';
    if (reg.test(commandObject.parameter)) {
      sonosPlayer.playTuneinRadio(commandObject.parameter)
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
        .then(() => { // show success
          helper.showSuccess(node, sonosFunction);
          return true;
        })
        .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
    } else {
      node.debug('invalid TuneIn radio id: ' + JSON.stringify(commandObject));
      helper.showError(node, msg, new Error('n-r-c-s-p: invalid TuneIn radio id: ' + JSON.stringify(commandObject)), sonosFunction, 'invalid TuneIn radio id');
    }
  }

  /**  Play a specific  My Sonos radio station (only TuneIn, AmazonPrime, MP3 station), start playing and optionally set volume
  * @param  {Object} node current node
  * @param  {object} msg incoming message - uses msg.volume if provided
  * @param  {object} sonosPlayer Sonos Player
  * @param  {object} commandObject command with function and parameter
  * change msg.payload to current station title if no error occures
  */
  function playMySonos (node, msg, sonosPlayer, commandObject) {
    // get list of My Sonos stations
    const sonosFunction = 'play mysonos';
    const stationList = [];
    let stationTitleFinal = 'unbekannt';
    sonosPlayer.getFavorites()
      .then(response => { // select right command to play and play
        // validate response
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined getFavorites response received ' + JSON.stringify(response));
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          throw new Error('n-r-c-s-p: undefined favorite list received ' + JSON.stringify(response));
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list' + JSON.stringify(response));
        }

        // create stationList with all valid items and source field: TuneIn, AmazonPrime, MP3 station
        const TUNEIN_PREFIX = 'x-sonosapi-stream:';
        const AMAZON_PREFIX = 'x-sonosapi-radio:';
        const MP3_PREFIX = 'x-rincon-mp3radio:';
        let radioId;
        let stationUri;
        let stationTitle;
        for (let i = 0; i < response.items.length; i++) {
          if (typeof response.items[i].uri === 'undefined' || response.items[i].uri === null ||
            (typeof response.items[i].uri === 'number' && isNaN(response.items[i].uri)) || response.items[i].uri === '') {
            // uri not defined - example: Sonos PocketCast --- ignore!
          } else {
            stationUri = response.items[i].uri;

            if (typeof response.items[i].title === 'undefined' || response.items[i].title === null ||
              (typeof response.items[i].title === 'number' && isNaN(response.items[i].title)) || response.items[i].title === '') {
              throw new Error('n-r-c-s-p: undefined title at position ' + String(i));
            }
            stationTitle = response.items[i].title;
            if (stationUri.startsWith(TUNEIN_PREFIX)) {
            // get stationId
              radioId = stationUri.split('?')[0];
              radioId = radioId.substr(TUNEIN_PREFIX.length);
              stationList.push({ title: stationTitle, radioId: radioId, uri: stationUri, source: 'TuneIn' });
              stationTitleFinal = stationTitle;
            }
            if (stationUri.startsWith(AMAZON_PREFIX)) {
              stationList.push({ title: stationTitle, uri: stationUri, source: 'AmazonPrime' });
              stationTitleFinal = stationTitle;
            }
            if (stationUri.startsWith(MP3_PREFIX)) {
              stationList.push({ title: stationTitle, uri: stationUri, source: 'MP3Stream' });
              stationTitleFinal = stationTitle;
            }
          }
        }

        if (stationList.length === 0) {
          throw new Error('n-r-c-s-p: no TuneIn/Amazon/Internet station in my sonos');
        }
        node.debug('successfully extracted relevant station list');

        // lookup topic in list and play radio station - first match counts
        for (let i = 0; i < stationList.length; i++) {
          if (((stationList[i].title).indexOf(commandObject.parameter)) >= 0) {
            // play radio station
            if (stationList[i].source === 'TuneIn') {
              return sonosPlayer.playTuneinRadio(stationList[i].radioId);
            } else if (stationList[i].source === 'AmazonPrime') {
              return sonosPlayer.setAVTransportURI(stationList[i].uri);
            } else if (stationList[i].source === 'MP3Stream') {
              return sonosPlayer.setAVTransportURI(stationList[i].uri);
            } else {
              throw new Error('n-r-c-s-p: Neither tuneIn nor amazon nor mp3 radio');
            }
          }
        }
        // did not find matching stations
        throw new Error('n-r-c-s-p: topic not found in my sonos list');
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
      .then(() => { // show success
        helper.showSuccess(node, sonosFunction);
        msg.payload = stationTitleFinal;
        return true;
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }

  /**  Get list of My Sonos radion station (only TuneIn, AmazonPrime, MP3 stations).
  * @param  {Object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * change msg.payload to current array of my Sonos radio stations
  */
  function getMySonosStations (node, msg, sonosPlayer) {
    // get list of My Sonos stations
    const sonosFunction = 'get my sonos stations';
    const stationList = [];
    sonosPlayer.getFavorites()
      .then(response => {
        // validate response
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined getFavorites response received ' + JSON.stringify(response));
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          throw new Error('n-r-c-s-p: undefined favorite list received ' + JSON.stringify(response));
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list' + JSON.stringify(response));
        }

        // create stationList with all valid items and source field: TuneIn, AmazonPrime, MP3
        const TUNEIN_PREFIX = 'x-sonosapi-stream:';
        const AMAZON_PREFIX = 'x-sonosapi-radio:';
        const MP3_PREFIX = 'x-rincon-mp3radio:';
        let radioId;
        let stationUri;
        let stationTitle;
        let ingnoredItems = 0;
        node.debug('start processing items');
        for (let i = 0; i < (response.items).length; i++) {
          if (typeof response.items[i].uri === 'undefined' || response.items[i].uri === null ||
            (typeof response.items[i].uri === 'number' && isNaN(response.items[i].uri)) || response.items[i].uri === '') {
            // uri not defined - example: Sonos PocketCast
            ingnoredItems++;
          } else {
            stationUri = response.items[i].uri;

            if (typeof response.items[i].title === 'undefined' || response.items[i].title === null ||
              (typeof response.items[i].title === 'number' && isNaN(response.items[i].title)) || response.items[i].title === '') {
              throw new Error('n-r-c-s-p: undefined title at position ' + String(i));
            }
            stationTitle = response.items[i].title;
            if (stationUri.startsWith(TUNEIN_PREFIX)) {
            // get stationId
              radioId = stationUri.split('?')[0];
              radioId = radioId.substr(TUNEIN_PREFIX.length);
              stationList.push({ title: stationTitle, radioId: radioId, uri: stationUri, source: 'TuneIn' });
            }
            if (stationUri.startsWith(AMAZON_PREFIX)) {
              stationList.push({ title: stationTitle, uri: stationUri, source: 'AmazonPrime' });
            }
            if (stationUri.startsWith(MP3_PREFIX)) {
              stationList.push({ title: stationTitle, uri: stationUri, source: 'MP3Stream' });
            }
            node.debug('successfully processed item:  ' + String(i));
          }
        }
        if (stationList.length === 0) {
          throw new Error('n-r-c-s-p: no TuneIn/Amazon/Internet station in my sonos');
        }
        if (ingnoredItems > 0) {
          helper.showWarning(node, sonosFunction, 'Some My Sonos items do not contain an uri', 'Count: ' + String(ingnoredItems));
        }
        node.debug('successfully finished routine');
        return true;
      })
      .then(() => {
        helper.showSuccess(node, sonosFunction);
        msg.payload = stationList;
        node.send(msg);
        return true;
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }

  /**  Get list of My Sonos all items.
  * @param  {Object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * change msg.payload to current array of my Sonos radio stations
  */
  function getMySonosAll (node, msg, sonosPlayer) {
    // get list of My Sonos items
    const sonosFunction = 'get my sonos all';
    sonosPlayer.getFavorites()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: undefined getFavorites response received ' + JSON.stringify(response)), sonosFunction, 'undefined getqueue response received');
          return;
        }

        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: undefined favorite list received ' + JSON.stringify(response)), sonosFunction, 'undefined favorite list received');
          return;
        }

        // filter: Amazon Prime Playlists only
        if (!Array.isArray(response.items)) {
          helper.showError(node, msg, new Error('n-r-c-s-p: did not receive a list' + JSON.stringify(response)), sonosFunction, 'did not receive a list');
          return;
        }
        const list = response.items;
        if (list.length === 0) {
          helper.showError(node, msg, new Error('n-r-c-s-p: no my sonos items found'), sonosFunction, 'no my sonos items found');
          return;
        }
        helper.showSuccess(node, sonosFunction);
        msg.payload = list;
        node.send(msg);
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }
  RED.nodes.registerType('sonos-manage-radio', SonosManageRadioNode);
};
