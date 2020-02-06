const NrcspHelpers = require('./Helper.js');
const NodesonosHelpers = require('sonos/lib/helpers');
const request = require('axios');

module.exports = function (RED) {
  'use strict';

  /**  Create Control Player Node and subscribe to messages.
  * @param  {Object} config current node configuration data
  */
  function SonosControlPlayerNode (config) {
    RED.nodes.createNode(this, config);
    const sonosFunction = 'setup subscribe';

    const node = this;
    const configNode = RED.nodes.getNode(config.confignode);

    if (!NrcspHelpers.validateConfigNode(configNode)) {
      NrcspHelpers.failure(node, null, new Error('n-r-c-s-p: invalid config node'), sonosFunction);
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
        NrcspHelpers.warning(node, sonosFunction, 'No ip address', 'Providing ip address is recommended');
        if (!(typeof configNode.serialnum === 'undefined' || configNode.serialnum === null ||
                (typeof configNode.serialnum === 'number' && isNaN(configNode.serialnum)) || (configNode.serialnum.trim()).length < 19)) {
          NrcspHelpers.discoverSonosPlayerBySerial(node, configNode.serialnum, (err, ipAddress) => {
            if (err) {
              NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: discovery failed'), sonosFunction);
              return;
            }
            if (ipAddress === null) {
              NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: could not find any player by serial'), sonosFunction);
            } else {
              // setting of nodestatus is done in following call handelIpuntMessage
              node.debug('Found sonos player');
              processInputMsg(node, msg, ipAddress);
            }
          });
        } else {
          NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: invalid config node - invalid serial'), sonosFunction);
        }
      }
    });
  }

  // ------------------------------------------------------------------------------------

  /**  Validate sonos player and input message then dispatch further.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {string} ipaddress IP address of sonos player
  */
  function processInputMsg (node, msg, ipaddress) {
    const sonosFunction = 'handle input msg';
    // get sonos player
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (typeof sonosPlayer === 'undefined' || sonosPlayer === null ||
      (typeof sonosPlayer === 'number' && isNaN(sonosPlayer)) || sonosPlayer === '') {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined sonos player. Check configuration'), sonosFunction);
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (typeof msg.payload === 'undefined' || msg.payload === null ||
      (typeof msg.payload === 'number' && isNaN(msg.payload)) || msg.payload === '') {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined payload'), sonosFunction);
      return;
    }

    let command = String(msg.payload);
    command = command.toLowerCase();
    let commandWithParam = {};

    // dispatch
    const basicCommandList = ['play', 'pause', 'stop', 'toggleplayback', 'mute', 'unmute', 'next_song', 'previous_song', 'join_group', 'leave_group', 'activate_avtransport'];
    if (basicCommandList.indexOf(command) > -1) {
      handleCommandBasic(node, msg, sonosPlayer, command);
    } else if (command === 'play_notification') {
      handlePlayNotification(node, msg, sonosPlayer);
    } else if (command.startsWith('+')) {
      commandWithParam = { cmd: 'volume_increase', parameter: command };
      handleVolumeCommand(node, msg, sonosPlayer, commandWithParam);
    } else if (command.startsWith('-')) {
      commandWithParam = { cmd: 'volume_decrease', parameter: command };
      handleVolumeCommand(node, msg, sonosPlayer, commandWithParam);
    } else if (!isNaN(parseInt(command))) {
      commandWithParam = { cmd: 'volume_set', parameter: command };
      handleVolumeCommand(node, msg, sonosPlayer, commandWithParam);
    } else if (command === 'set_led') {
      handleSetLed(node, msg, sonosPlayer);
    } else if (command === 'set_crossfade') {
      handleSetCrossfade(node, msg, sonosPlayer);
    } else if (command === 'set_eq') {
      handleSetEQ(node, msg, sonosPlayer);
      // TODO lab_ function - remove
    } else if (command === 'lab_test') {
      labTest(node, msg, sonosPlayer);
    } else {
      NrcspHelpers.warning(node, sonosFunction, 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(commandWithParam));
    }
  }

  // -----------------------------------------------------
  // Commands
  // -----------------------------------------------------

  /**  Handle basic commands to control sonos player.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *                 volume valid volume
  * @param  {Object} sonosPlayer Sonos Player
  * @param  {string} cmd command - no parameter
  * @param msg.payload = true if successful
  */
  function handleCommandBasic (node, msg, sonosPlayer, cmd) {
    const sonosFunction = cmd;

    switch (cmd) {
      case 'play':
        sonosPlayer.play()
          .then(() => {
            // validate volume: integer, betweent 1 and 99 and set
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
            NrcspHelpers.success(node, msg, sonosFunction);
            return true;
          })
          .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
        break;

      case 'stop':
        sonosPlayer.stop()
          .then(() => {
            msg.payload = true;
            NrcspHelpers.success(node, msg, sonosFunction);
            return true;
          })
          .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
        break;

      case 'pause':
        sonosPlayer.pause()
          .then(() => {
            msg.payload = true;
            NrcspHelpers.success(node, msg, sonosFunction);
            return true;
          })
          .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
        break;

      case 'toggleplayback':
        sonosPlayer.togglePlayback()
          .then(() => {
            msg.payload = true;
            NrcspHelpers.success(node, msg, sonosFunction);
            return true;
          })
          .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
        break;

      case 'mute':
        sonosPlayer.setMuted(true)
          .then(() => {
            msg.payload = true;
            NrcspHelpers.success(node, msg, sonosFunction);
            return true;
          })
          .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
        break;

      case 'unmute':
        sonosPlayer.setMuted(false)
          .then(() => {
            msg.payload = true;
            NrcspHelpers.success(node, msg, sonosFunction);
            return true;
          })
          .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
        break;

      case 'next_song':
        //  CAUTION! PRERQ: there should be a next song. Only a few stations support that (example Amazon Prime)
        sonosPlayer.next()
          .then(() => {
            msg.payload = true;
            NrcspHelpers.success(node, msg, sonosFunction);
            return true;
          })
          .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
        break;

      case 'previous_song':
        //  CAUTION! PRERQ: there should be a previous song. Only a few stations support that (example Amazon Prime)
        sonosPlayer.previous(false)
          .then(() => {
            msg.payload = true;
            NrcspHelpers.success(node, msg, sonosFunction);
            return true;
          })
          .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
        break;

      case 'leave_group':
        sonosPlayer.leaveGroup()
          .then(() => {
            msg.payload = true;
            NrcspHelpers.success(node, msg, sonosFunction);
            return true;
          })
          .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
        break;

      case 'join_group': {
        if (typeof msg.topic === 'undefined' || msg.topic === null ||
          (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
          NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
          return;
        }

        const deviceToJoing = msg.topic;
        sonosPlayer.joinGroup(deviceToJoing)
          .then(() => {
            msg.payload = true;
            NrcspHelpers.success(node, msg, sonosFunction);
            return true;
          })
          .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
        break;
      }
      case 'activate_avtransport':
        // validate msg.topic
        if (typeof msg.topic === 'undefined' || msg.topic === null ||
          (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
          NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
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
            NrcspHelpers.success(node, msg, sonosFunction);
            return true;
          })
          .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
        break;
    }
  }

  /**  Send set/adjust volume command to sonos player.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * @param  {Object} commandObject command - cmd and parameter both as string or volume as integer
  * special: volume range 1.. 99, adjust volume rage -29 ..  +29
  */
  function handleVolumeCommand (node, msg, sonosPlayer, commandObject) {
    const sonosFunction = commandObject.cmd;
    const volumeValue = parseInt(commandObject.parameter); // convert to integer
    switch (commandObject.cmd) {
      case 'volume_set':
        if (Number.isInteger(volumeValue)) {
          if (volumeValue > 0 && volumeValue < 100) {
            node.debug('is in range:' + volumeValue);
          } else {
            NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: volume is out of range: ' + String(volumeValue)));
            return;
          }
        } else {
          NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: volume is not valid number: ' + volumeValue));
          return;
        }
        sonosPlayer.setVolume(volumeValue)
          .then(NrcspHelpers.success(node, msg, sonosFunction))
          .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
        break;
      case 'volume_decrease':
      case 'volume_increase':
        if (Number.isInteger(volumeValue)) {
          if (volumeValue > -30 && volumeValue < 30) {
            node.debug('is in range ' + volumeValue);
          } else {
            NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: volume is out of range: ' + String(volumeValue)));
            return;
          }
        } else {
          NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: volume is not valid number: ' + volumeValue));
          return;
        }
        sonosPlayer.adjustVolume(volumeValue)
          .then(() => {
            msg.payload = true;
            NrcspHelpers.success(node, msg, sonosFunction);
            return true;
          })
          .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
        break;
    }
  }

  /**  Play Notification.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *                 topic valid topic lab_play_uri
  *                 volume valide volume to set
  * @param  {Object} sonosPlayer Sonos Player
  * uses msg.topic (uri) and optional msg.volume (default is 40)
  */
  function handlePlayNotification (node, msg, sonosPlayer) {
    const sonosFunction = 'play notification';
    // validate msg.topic.
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    // validate msg.volume - use default as backup
    let notificationVolume;
    const defaultVolume = 40;
    if (typeof msg.volume === 'undefined' || msg.volume === null ||
      (typeof msg.volume === 'number' && isNaN(msg.volume)) || msg.volume === '') {
      notificationVolume = defaultVolume; // default
    } else {
      notificationVolume = parseInt(msg.volume);
      if (Number.isInteger(notificationVolume)) {
        if (notificationVolume > 0 && notificationVolume < 100) {
          node.debug('is in range ' + notificationVolume);
        } else {
          node.debug('is not in range: ' + notificationVolume);
          notificationVolume = defaultVolume;
          NrcspHelpers.warning(node, sonosFunction, 'volume value out of range - set to default', 'value-> ' + JSON.stringify(notificationVolume));
        }
      } else {
        node.debug('is not number');
        notificationVolume = defaultVolume;
        NrcspHelpers.warning(node, sonosFunction, 'invalid volume - set to default', 'value-> ' + JSON.stringify(notificationVolume));
      }
    }
    const uri = String(msg.topic).trim();
    node.debug('notification volume ' + String(notificationVolume));
    sonosPlayer.playNotification(
      {
        uri: uri,
        onlyWhenPlaying: false,
        volume: notificationVolume // Change the volume for the notification, and revert back afterwards.
      })
      .then(() => {
        msg.payload = true;
        NrcspHelpers.success(node, msg, sonosFunction);
        return true;
      })
      .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction))
      .finally(() => node.debug('process id- finally ' + process.pid));
  }

  /**  Set LED On or Off.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *             topic: On | Off
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} msg not changeed
  */
  function handleSetLed (node, msg, sonosPlayer) {
    const sonosFunction = 'set LED';
    // validate msg.topic.
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    if (!(msg.topic === 'On' || msg.topic === 'Off')) {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: topic must be On or Off'), sonosFunction);
      return;
    }

    sonosPlayer.setLEDState(msg.topic)
      .then(() => {
        // msg not changed
        NrcspHelpers.success(node, msg, sonosFunction);
        return true;
      })
      .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
  }

  /**  Set CrossfadeMode
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * @output {String} msg.payload not changed
  */
  function handleSetCrossfade (node, msg, sonosPlayer) {
    const sonosFunction = 'set crossfade';
    // validate msg.topic.
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined topic - should be On or Off'), sonosFunction);
      return;
    }
    if (!(msg.topic === 'On' || msg.topic === 'Off')) {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: topic must be On or Off'), sonosFunction);
      return;
    }
    const newValue = (msg.topic === 'On' ? 1 : 0);

    // set parameter for request
    const baseURL = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    const controlURL = '/MediaRenderer/AVTransport/Control';
    const name = 'AVTransport';
    const action = 'SetCrossfadeMode';
    const options = { InstanceID: 0, CrossfadeMode: newValue };

    // define header
    const messageAction = `"urn:schemas-upnp-org:service:${name}:1#${action}"`;

    // create body
    let messageBody = `<u:${action} xmlns:u="urn:schemas-upnp-org:service:${name}:1">`;
    Object.keys(options).forEach(key => {
      messageBody += `<${key}>${options[key]}</${key}>`;
    });
    messageBody += `</u:${action}>`;

    // create tag to handel response from SONOS player
    const responseTag = `u:${action}Response`;

    node.debug('starting request now');
    request({
      baseURL: baseURL,
      url: controlURL,
      method: 'post',
      headers: {
        SOAPAction: messageAction,
        'Content-type': 'text/xml; charset=utf8'
      },
      data: NodesonosHelpers.CreateSoapEnvelop(messageBody)
    })
      .then(response => { // parse SONOS player response
        node.debug('response received');
        return NodesonosHelpers.ParseXml(response.data);
      })
      .then(result => { // verify response, extract value and output
        node.debug('Parsed: ' + JSON.stringify(result));
        if (!result || !result['s:Envelope'] || !result['s:Envelope']['s:Body']) {
          console.log('SOAP missing response');
          throw new Error('Invalid response for ' + action + ': ' + result);
        } else if (typeof result['s:Envelope']['s:Body']['s:Fault'] !== 'undefined') {
          // SOAP exception handling - does that ever happen?
          console.log('SOAP s:Fault: ' + result['s:Envelope']['s:Body']['s:Fault']);
          throw new Error('SOAP s:Fault: ' + result['s:Envelope']['s:Body']['s:Fault']);
        } else if (typeof result['s:Envelope']['s:Body'][responseTag] !== 'undefined') {
          const output = result['s:Envelope']['s:Body'][responseTag];
          // Remove namespace from result
          delete output['xmlns:u'];
          // response does not include any confirmation
          NrcspHelpers.success(node, msg, sonosFunction);
          return true;
        } else { // missing response tag
          console.log('Error: Missing response tag for ' + action + ': ' + result);
          throw new Error('Missing response tag for ' + action + ': ' + result);
        }
      })
      .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
  }

  /** handleSetEQ: set EQ (for specified EQTypes eg NightMode, DialogLevel (aka Speech Enhancement) and SubGain (aka sub Level)) for player with TV
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *                 msg.topic specifies EQtype
                    msg.eqvalue specifies the new value (On/Off or level)
  * @param  {Object} sonosPlayer sonos player object
  * @output {Object} payload with nightMode, SpeechEnhancement, subGain
  */
  function handleSetEQ (node, msg, sonosPlayer) {
    const sonosFunction = 'set EQ';

    // validate eqType from msg.topic
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    const eqType = msg.topic;
    if (!NrcspHelpers.EQ_TYPES.includes(eqType)) {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: invalid topic. Should be one of ' + NrcspHelpers.EQ_TYPES.toString()), sonosFunction);
      return;
    }

    // validate value from msg.value
    if (typeof msg.eqvalue === 'undefined' || msg.eqvalue === null ||
      (typeof msg.eqvalue === 'number' && isNaN(msg.eqvalue)) || msg.eqvalue === '') {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined new value'), sonosFunction);
      return;
    }
    let newValue = msg.eqvalue;
    if (eqType === 'SubGain') {
      // validate integer in range -15 to 15
      if (Number.isInteger(newValue)) {
        if (newValue < -15 || newValue > 15) {
          NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: msg.eqvalue must be in range -15 to +15'), sonosFunction);
          return;
        }
      } else {
        NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: msg.eqvalue must be of type integer'), sonosFunction);
        return;
      }
    } else if (eqType === 'NightMode' || eqType === 'DialogLevel') {
      // validate: On/Off
      if (newValue === 'On') {
        newValue = 1;
      } else if (newValue === 'Off') {
        newValue = 0;
      } else {
        NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: eqvalue must be On or Off'), sonosFunction);
        return;
      }
    } else {
      // not yet supported
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: EQType in msg.topic is not yet supported'), sonosFunction);
      return;
    }

    // set parameter for request
    const baseURL = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    const controlURL = '/MediaRenderer/RenderingControl/Control';
    const name = 'RenderingControl';
    const action = 'SetEQ';
    const options = { InstanceID: 0, EQType: eqType, DesiredValue: newValue };

    // define header
    const messageAction = `"urn:schemas-upnp-org:service:${name}:1#${action}"`;

    // create body
    let messageBody = `<u:${action} xmlns:u="urn:schemas-upnp-org:service:${name}:1">`;
    Object.keys(options).forEach(key => {
      messageBody += `<${key}>${options[key]}</${key}>`;
    });
    messageBody += `</u:${action}>`;

    // create tag to handle response from SONOS player
    const responseTag = `u:${action}Response`;

    sonosPlayer.deviceDescription()
      .then(response => { // ensure that SONOS player has TV mode
        if (typeof response === 'undefined' || response === null ||
            (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined device description received');
        }
        if (typeof response.modelName === 'undefined' || response.modelName === null ||
            (typeof response.modelName === 'number' && isNaN(response.modelName)) || response.modelName === '') {
          throw new Error('n-r-c-s-p: undefined model name received');
        }
        if (!NrcspHelpers.PLAYER_WITH_TV.includes(response.modelName)) {
          throw new Error('n-r-c-s-p: your player does not support TV');
        }
        return true;
      })
      .then(() => { // send request to SONOS player
        return request({
          baseURL: baseURL,
          url: controlURL,
          method: 'post',
          headers: {
            SOAPAction: messageAction,
            'Content-type': 'text/xml; charset=utf8'
          },
          data: NodesonosHelpers.CreateSoapEnvelop(messageBody)
        });
      })
      .then(response => { // parse SONOS player response
        return NodesonosHelpers.ParseXml(response.data);
      })
      .then(result => { // verify response, extract value and output
        node.debug('reponse: ' + JSON.stringify(result));
        if (!result || !result['s:Envelope'] || !result['s:Envelope']['s:Body']) {
          console.log('SOAP missing response');
          throw new Error('Invalid response for ' + action + ': ' + result);
        } else if (typeof result['s:Envelope']['s:Body']['s:Fault'] !== 'undefined') {
          // SOAP exception handling - does that ever happen?
          console.log('SOAP s:Fault: ' + result['s:Envelope']['s:Body']['s:Fault']);
          throw new Error('SOAP s:Fault: ' + result['s:Envelope']['s:Body']['s:Fault']);
        } else if (typeof result['s:Envelope']['s:Body'][responseTag] !== 'undefined') {
          // msg not changed
          NrcspHelpers.success(node, msg, sonosFunction);
        } else { // missing response tag
          console.log('Error: Missing response tag for ' + action + ': ' + result);
          throw new Error('Missing response tag for ' + action + ': ' + result);
        }
      })
      .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
  }

  /**  LAB: Test new features, error messsages, ...
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  */
  function labTest (node, msg, sonosPlayer) {
    const sonosFunction = 'lab test';
    // Check msg.topic.
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelpers.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
      return;
    }
    const uri = String(msg.topic).trim();
    node.debug('starting setAVTransportURI');
    sonosPlayer.setAVTransportURI(uri)
      .then(() => {
        msg.payload = true;
        NrcspHelpers.success(node, msg, sonosFunction);
        return true;
      })
      .catch(error => NrcspHelpers.failure(node, msg, error, sonosFunction));
  }
  RED.nodes.registerType('sonos-control-player', SonosControlPlayerNode);
};
