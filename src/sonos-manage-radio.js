const SonosHelper = require('./SonosHelper.js');
const helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosManageRadioNode (config) {
    /**  Create Manage Radio Node and subscribe to messages
    * @param  {object} config current node configuration data
    */

    RED.nodes.createNode(this, config);

    // verify config node. if valid then set status and subscribe to messages
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
    if (typeof sonosPlayer === 'undefined' || sonosPlayer === null || sonosPlayer === '') {
      node.status({ fill: 'red', shape: 'dot', text: 'error:get sonosplayer - sonos player is null.' });
      node.error('get sonosplayer - sonos player is null. Details: Check configuration.');
      return;
    }

    // Check msg.payload. Store lowercase version in command
    // payload contains basic function, topic contains parameters
    if (typeof msg.payload === 'undefined' || msg.payload === null || msg.payload === '') {
      node.status({ fill: 'red', shape: 'dot', text: 'error:validate payload - invalid payload.' });
      node.error('validate payload - invalid payload. Details: ' + JSON.stringify(msg.payload));
      return;
    }

    // dispatch (dont add msg.topic because may not exist and is not checked)
    const commandWithParam = {
      cmd: (String(msg.payload)).toLowerCase(),
      parameter: ''
    };
    if (commandWithParam.cmd === 'play_mysonos') {
      if (typeof msg.topic === 'undefined' || msg.topic === null || msg.topic === '') {
        node.status({ fill: 'red', shape: 'dot', text: 'error:validate mysonos - invalid topic' });
        node.error('validate mysonos - invalid topic. Details: msg.topic ->' + JSON.stringify(msg.topic));
        return;
      }
      commandWithParam.parameter = String(msg.topic);
      playMySonos(node, msg, sonosPlayer, commandWithParam);
    } else if (commandWithParam.cmd === 'play_tunein') {
      if (typeof msg.topic === 'undefined' || msg.topic === null || msg.topic === '') {
        node.status({ fill: 'red', shape: 'dot', text: 'error:validate tunein - invalid topic' });
        node.error('validate tunein - invalid topic.');
        return;
      }
      commandWithParam.parameter = String(msg.topic);
      playTuneIn(node, msg, sonosPlayer, commandWithParam);
    } else if (commandWithParam.cmd === 'get_mysonos') {
      getMySonosStations(node, msg, sonosPlayer);
    } else if (commandWithParam.cmd === 'get_mysonosall') {
      getMySonosAll(node, msg, sonosPlayer);
    } else {
      node.status({ fill: 'green', shape: 'dot', text: 'warning:depatching commands - invalid command' });
      node.warn('depatching commands - invalid command. Details: command -> ' + JSON.stringify(commandWithParam));
    }
  }

  // -----------------------------------------------------------------------------

  /**  Activate TuneIn radio station (via simple TuneIn Radio id).
  * @param  {Object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * @param  {object} commandObject command with function and parameter
  */
  function playTuneIn (node, msg, sonosPlayer, commandObject) {
    const reg = new RegExp('^[s][0-9]+$'); // example s11111
    const sonosFunction = 'play tunein';
    let errorShort = 'invalid response received';
    if (reg.test(commandObject.parameter)) {
      sonosPlayer.playTuneinRadio(commandObject.parameter)
        .then(response => {
          if (response === null || response === undefined) {
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(response));
            return;
          }
          helper.showSuccess(node, sonosFunction);
          node.send(msg);
        })
        .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
    } else {
      errorShort = 'invalid tunein id';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort}  Details: ` + JSON.stringify(commandObject.parameter));
    }
  }

  /**  Get list of My Sonos radion station (only TuneIn, AmazonPrime) and start playing.
  * @param  {Object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * @param  {object} commandObject command with function and parameter
  * change msg.payload to current station title if no error occures
  */
  function playMySonos (node, msg, sonosPlayer, commandObject) {
    // get list of My Sonos stations
    const sonosFunction = 'play mysonos';
    let errorShort = 'invalid favorite list received';
    sonosPlayer.getFavorites()
      .then(response => {
        if (!(response.returned !== null && response.returned !== undefined &&
          response.returned && parseInt(response.returned) > 0)) {
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
          node.error(`${sonosFunction} - ${errorShort} Details: response->` + JSON.stringify(response));
          return;
        }

        // filter: TuneIn or Amazon Prime radio stations
        const TUNEIN_PREFIX = 'x-sonosapi-stream:';
        const AMAZON_PREFIX = 'x-sonosapi-radio:';
        const stationList = [];
        let stationUri;
        let radioId;
        for (let i = 0; i < parseInt(response.returned); i++) {
          if (response.items[i].uri.startsWith(TUNEIN_PREFIX)) {
          // get stationId
            stationUri = response.items[i].uri;
            radioId = stationUri.split('?')[0];
            radioId = radioId.substr(TUNEIN_PREFIX.length);
            stationList.push({ title: response.items[i].title, radioId: radioId, uri: stationUri, source: 'TuneIn' });
          }
          if (response.items[i].uri.startsWith(AMAZON_PREFIX)) {
            stationList.push({ title: response.items[i].title, uri: response.items[i].uri, source: 'AmazonPrime' });
          }
        }
        if (stationList.length === 0) {
          errorShort = 'no TuneIn/Amazon station in my sonos';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
          node.error(`${sonosFunction} - ${errorShort} Details: mysonos->` + JSON.stringify(response.items));
          return;
        }

        // lookup topic in list and play radio station - first match counts
        let isInStationList = false;
        for (let i = 0; i < stationList.length; i++) {
          if (((stationList[i].title).indexOf(commandObject.parameter)) >= 0) {
            // play radion station
            isInStationList = true;
            if (stationList[i].source === 'TuneIn') {
              sonosPlayer.playTuneinRadio(stationList[i].radioId)
                .then(response => {
                  helper.showSuccess(node, sonosFunction);
                  msg.payload = stationList[i].title;
                  node.send(msg);
                })
                .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
            } else if (stationList[i].source === 'AmazonPrime') {
              sonosPlayer.setAVTransportURI(stationList[i].uri)
                .then(response => {
                  helper.showSuccess(node, sonosFunction);
                  msg.payload = stationList[i].title;
                  node.send(msg);
                })
                .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
            } else {
              errorShort = 'Neither tuneIn nor amazon';
              node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
              node.error(`${sonosFunction} - ${errorShort} Details: stationlist-> ` + JSON.stringify(stationList));
              return;
            }
            break;
          }
        }
        if (!isInStationList) {
          errorShort = 'topic not found in my sonos list';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
          node.error(`${sonosFunction} - ${errorShort} Details: stationlist-> ` + JSON.stringify(stationList));
        }
      })
      .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
  }

  /**  Get list of My Sonos radion station (only TuneIn, AmazonPrime).
  * @param  {Object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * change msg.payload to current array of my Sonos radio stations
  */
  function getMySonosStations (node, msg, sonosPlayer) {
    // get list of My Sonos stations
    const sonosFunction = 'get my sonos stations';
    let errorShort = 'invalid favorite list received';
    sonosPlayer.getFavorites()
      .then(response => {
        if (!(response.returned !== null && response.returned !== undefined &&
          response.returned && parseInt(response.returned) > 0)) {
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
          node.error(`${sonosFunction} - ${errorShort} Details: response->` + JSON.stringify(response));
          return;
        }

        // filter: TuneIn or Amazon Prime radio stations
        const TUNEIN_PREFIX = 'x-sonosapi-stream:';
        const AMAZON_PREFIX = 'x-sonosapi-radio:';
        const stationList = [];
        let stationUri;
        let radioId;
        for (let i = 0; i < parseInt(response.returned); i++) {
          if (response.items[i].uri.startsWith(TUNEIN_PREFIX)) {
          // get stationId
            stationUri = response.items[i].uri;
            radioId = stationUri.split('?')[0];
            radioId = radioId.substr(TUNEIN_PREFIX.length);
            stationList.push({ title: response.items[i].title, radioId: radioId, uri: stationUri, source: 'TuneIn' });
          }
          if (response.items[i].uri.startsWith(AMAZON_PREFIX)) {
            stationList.push({ title: response.items[i].title, uri: response.items[i].uri, source: 'AmazonPrime' });
          }
        }
        if (stationList.length === 0) {
          errorShort = 'no TuneIn/Amazon station in my sonos';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
          node.error(`${sonosFunction} - ${errorShort} Details: mysonos->` + JSON.stringify(response.items));
          return;
        }
        helper.showSuccess(node, sonosFunction);
        msg.payload = stationList;
        node.send(msg);
      })
      .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
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
    let errorShort = 'invalid my sonos list received';
    sonosPlayer.getFavorites()
      .then(response => {
        if (!(response.returned !== null && response.returned !== undefined &&
          response.returned && parseInt(response.returned) > 0)) {
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
          node.error(`${sonosFunction} - ${errorShort} Details: response->` + JSON.stringify(response));
          return;
        }
        const list = response.items;
        if (list.length === 0) {
          errorShort = 'no my sonos items found';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
          node.error(`${sonosFunction} - ${errorShort} Details: mysonos->` + JSON.stringify(response.items));
          return;
        }
        helper.showSuccess(node, sonosFunction);
        msg.payload = list;
        node.send(msg);
      })
      .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
  }
  RED.nodes.registerType('sonos-manage-radio', SonosManageRadioNode);
};
