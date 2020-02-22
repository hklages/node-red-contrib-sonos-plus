const NrcspHelper = require('./Helper.js');
const NrcspSoap = require('./Soap.js');
// const NcrspSonos = require('./Sonos.js');

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
      // if ip address exist use it or get it via discovery based on serialNum
      if (!(typeof configNode.ipaddress === 'undefined' || configNode.ipaddress === null ||
        (typeof configNode.ipaddress === 'number' && isNaN(configNode.ipaddress)) || configNode.ipaddress.trim().length < 7)) {
        // exisiting ip address - fastes solution, no discovery necessary
        node.debug('using IP address of config node');
        processInputMsg(node, msg, configNode.ipaddress);
      } else {
        // have to get ip address via disovery with serial numbers
        NrcspHelper.warning(node, sonosFunction, 'No ip address', 'Providing ip address is recommended');
        if (!(typeof configNode.serialnum === 'undefined' || configNode.serialnum === null ||
                (typeof configNode.serialnum === 'number' && isNaN(configNode.serialnum)) || (configNode.serialnum.trim()).length < 19)) {
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
              processInputMsg(node, msg, ipAddress);
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
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined sonos player. Check configuration'), sonosFunction);
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (!NrcspHelper.isValidPropertyNotEmptyString(msg, ['payload'])) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined payload', sonosFunction));
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
      setCrossfadeMode(node, msg, sonosPlayer);
    } else if (command === 'set_loudness') {
      setLoudness(node, msg, sonosPlayer);
    } else if (command === 'set_eq') {
      setEQ(node, msg, sonosPlayer);
    } else if (command === 'set_sleeptimer') {
      configureSleepTimer(node, msg, sonosPlayer);
      // TODO lab_ function - remove
    } else if (command === 'lab_test') {
      labTest(node, msg, sonosPlayer);
    } else {
      NrcspHelper.warning(node, sonosFunction, 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(commandWithParam));
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
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'stop':
        sonosPlayer.stop()
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'pause':
        sonosPlayer.pause()
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'toggleplayback':
        sonosPlayer.togglePlayback()
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'mute':
        sonosPlayer.setMuted(true)
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'unmute':
        sonosPlayer.setMuted(false)
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'next_song':
        //  CAUTION! PRERQ: there should be a next song. Only a few stations support that (example Amazon Prime)
        sonosPlayer.next()
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'previous_song':
        //  CAUTION! PRERQ: there should be a previous song. Only a few stations support that (example Amazon Prime)
        sonosPlayer.previous(false)
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'leave_group':
        sonosPlayer.leaveGroup()
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'join_group': {
        if (typeof msg.topic === 'undefined' || msg.topic === null ||
          (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
          return;
        }

        const deviceToJoing = msg.topic;
        sonosPlayer.joinGroup(deviceToJoing)
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;
      }
      case 'activate_avtransport':
        // validate msg.topic
        if (typeof msg.topic === 'undefined' || msg.topic === null ||
          (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
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
            NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: volume is out of range: ' + String(volumeValue)));
            return;
          }
        } else {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: volume is not valid number: ' + volumeValue));
          return;
        }
        sonosPlayer.setVolume(volumeValue)
          .then(NrcspHelper.success(node, msg, sonosFunction))
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;
      case 'volume_decrease':
      case 'volume_increase':
        if (Number.isInteger(volumeValue)) {
          if (volumeValue > -30 && volumeValue < 30) {
            node.debug('is in range ' + volumeValue);
          } else {
            NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: volume is out of range: ' + String(volumeValue)));
            return;
          }
        } else {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: volume is not valid number: ' + volumeValue));
          return;
        }
        sonosPlayer.adjustVolume(volumeValue)
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
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
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
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
          NrcspHelper.warning(node, sonosFunction, 'volume value out of range - set to default', 'value-> ' + JSON.stringify(notificationVolume));
        }
      } else {
        node.debug('is not number');
        notificationVolume = defaultVolume;
        NrcspHelper.warning(node, sonosFunction, 'invalid volume - set to default', 'value-> ' + JSON.stringify(notificationVolume));
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
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction))
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
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    if (!(msg.topic === 'On' || msg.topic === 'Off')) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: topic must be On or Off'), sonosFunction);
      return;
    }

    sonosPlayer.setLEDState(msg.topic)
      .then(() => {
        // msg not changed
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Set CrossfadeMode
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * @output {String} msg.payload not changed
  */
  function setCrossfadeMode (node, msg, sonosPlayer) {
    const sonosFunction = 'set crossfade mode';

    // validate msg.topic.
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic - should be On or Off'), sonosFunction);
      return;
    }
    if (!(msg.topic === 'On' || msg.topic === 'Off')) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: topic must be On or Off'), sonosFunction);
      return;
    }
    const newValue = (msg.topic === 'On' ? 1 : 0);

    // copy action parameter and update
    const actionParameter = NrcspSoap.ACTIONS_TEMPLATES.SetCrossfadeMode;
    actionParameter.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    actionParameter.args[actionParameter.argsValueName] = newValue;
    const { baseUrl, path, name, action, args } = actionParameter;
    NrcspSoap.sendToPlayerV1(baseUrl, path, name, action, args)
      .then((response) => {
        node.debug('start xml to JSON');
        if (response.statusCode === 200) { // // maybe not necessary as promise will throw error
          return NrcspSoap.parseSoapBody(response.body);
        } else {
          throw new Error('n-r-c-s-p: status code: ' + response.statusCode + '-- body:' + JSON.stringify(response.body));
        }
      })
      .then((bodyXML) => { // verify response, now in JSON format
        node.debug('check success');
        // safely access property,  Oliver Steele's pattern
        const paths = actionParameter.responsePath;
        const result = paths.reduce((object, path) => {
          return (object || {})[path];
        }, bodyXML);
        if (result !== actionParameter.responseValue) {
          throw new Error('n-r-c-s-p: got error message from player: ' + JSON.stringify(bodyXML));
        }
        return true;
      })
      .then(() => {
        // msg not modified
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => {
        node.debug('start catch error');
        NrcspHelper.failure(node, msg, error, sonosFunction);
      });
  }

  /**  Set loudness
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * @output {String} msg.payload not changed
  */
  function setLoudness (node, msg, sonosPlayer) {
    const sonosFunction = 'set loudness';

    // validate msg.topic.
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic - should be On or Off'), sonosFunction);
      return;
    }
    if (!(msg.topic === 'On' || msg.topic === 'Off')) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: topic must be On or Off'), sonosFunction);
      return;
    }
    const newValue = (msg.topic === 'On' ? 1 : 0);

    // copy action parameter and update
    const actionParameter = NrcspSoap.ACTIONS_TEMPLATES.SetLoudness;
    actionParameter.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    actionParameter.args[actionParameter.argsValueName] = newValue;
    const { baseUrl, path, name, action, args } = actionParameter;
    NrcspSoap.sendToPlayerV1(baseUrl, path, name, action, args)
      .then((response) => {
        node.debug('start xml to JSON');
        if (response.statusCode === 200) { // // maybe not necessary as promise will throw error
          return NrcspSoap.parseSoapBody(response.body);
        } else {
          throw new Error('n-r-c-s-p: status code: ' + response.statusCode + '-- body:' + JSON.stringify(response.body));
        }
      })
      .then((bodyXML) => { // verify response, now in JSON format
        node.debug('check success');
        // safely access property,  Oliver Steele's pattern
        const paths = actionParameter.responsePath;
        const result = paths.reduce((object, path) => {
          return (object || {})[path];
        }, bodyXML);
        if (result !== actionParameter.responseValue) {
          throw new Error('n-r-c-s-p: got error message from player: ' + JSON.stringify(bodyXML));
        }
        return true;
      })
      .then(() => {
        // msg not modified
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => {
        node.debug('start catch error');
        NrcspHelper.failure(node, msg, error, sonosFunction);
      });
  }

  /** set EQ (for specified EQTypes eg NightMode, DialogLevel (aka Speech Enhancement) and SubGain (aka sub Level)) for player with TV.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *                 msg.topic specifies EQtype
                    msg.eqvalue specifies the new value (On/Off or level -15 .. 15)
  * @param  {Object} sonosPlayer sonos player object
  * @output {Object} payload with nightMode, SpeechEnhancement, subGain
  */
  function setEQ (node, msg, sonosPlayer) {
    const sonosFunction = 'set EQ';

    // copy action parameter and update
    const actionParameter = NrcspSoap.ACTIONS_TEMPLATES.SetEQ;
    actionParameter.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;

    // validate msg.topic (eg type)
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    const eqType = msg.topic;
    if (!actionParameter.eqTypeValues.includes(eqType)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: invalid topic. Should be one of ' + NrcspHelper.EQ_TYPES.toString()), sonosFunction);
      return;
    }

    // validate msg.value
    if (typeof msg.eqvalue === 'undefined' || msg.eqvalue === null ||
      (typeof msg.eqvalue === 'number' && isNaN(msg.eqvalue)) || msg.eqvalue === '') {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined new value'), sonosFunction);
      return;
    }
    let newValue = msg.eqvalue;
    if (eqType === 'SubGain') {
      // validate integer in range -15 to 15
      if (Number.isInteger(newValue)) {
        if (newValue < -15 || newValue > 15) {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: msg.eqvalue must be in range -15 to +15'), sonosFunction);
          return;
        }
      } else {
        NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: msg.eqvalue must be of type integer'), sonosFunction);
        return;
      }
    } else if (eqType === 'NightMode' || eqType === 'DialogLevel') {
      // validate: On/Off
      if (newValue === 'On') {
        newValue = 1;
      } else if (newValue === 'Off') {
        newValue = 0;
      } else {
        NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: eqvalue must be On or Off'), sonosFunction);
        return;
      }
    } else {
      // not yet supported
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: EQType in msg.topic is not yet supported'), sonosFunction);
      return;
    }

    // update args
    actionParameter.args.EQType = eqType;
    actionParameter.args.DesiredValue = newValue;

    sonosPlayer.deviceDescription()
      .then((response) => { // ensure that SONOS player has TV mode
        if (typeof response === 'undefined' || response === null ||
            (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined device description received');
        }
        if (typeof response.modelName === 'undefined' || response.modelName === null ||
            (typeof response.modelName === 'number' && isNaN(response.modelName)) || response.modelName === '') {
          throw new Error('n-r-c-s-p: undefined model name received');
        }
        if (!NrcspHelper.PLAYER_WITH_TV.includes(response.modelName)) {
          throw new Error('n-r-c-s-p: your player does not support TV');
        }
        return true;
      })
      .then(() => { // send request to SONOS player
        const { baseUrl, path, name, action, args } = actionParameter;
        return NrcspSoap.sendToPlayerV1(baseUrl, path, name, action, args);
      })
      .then((response) => {
        if (response.statusCode === 200) { // // maybe not necessary as promise will throw error
          return NrcspSoap.parseSoapBody(response.body);
        } else {
          throw new Error('n-r-c-s-p: status code: ' + response.statusCode + '-- body:' + JSON.stringify(response.body));
        }
      })
      .then((bodyXML) => { // verify response, now in JSON format
        node.debug(JSON.stringify(bodyXML));
        // safely access property,  Oliver Steele's pattern
        const paths = actionParameter.responsePath;
        const result = paths.reduce((object, path) => {
          return (object || {})[path];
        }, bodyXML);
        if (result !== actionParameter.responseValue) {
          throw new Error('n-r-c-s-p: got error message from player: ' + JSON.stringify(bodyXML));
        }
        return true;
      })
      .then(() => {
        // msg not modified
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  configureSleepTimer sets the sleep timer.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
            {String} msg.topic format hh:mm:ss hh < 20
  * @param  {Object} sonosPlayer Sonos Player
  * @output: {Object} msg unmodified / stopped in case of error
  */
  function configureSleepTimer (node, msg, sonosPlayer) {
    const sonosFunction = 'set/configure sleep timer';

    // validate msg.topic.
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic - should be in format hh:mm:ss, hh < 20'), sonosFunction);
      return;
    }
    const newValue = msg.topic;
    if (!NrcspHelper.REGEX_TIME.test(newValue)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: msg.topic must have format hh:mm:ss, hh < 20'), sonosFunction);
      return;
    }

    // copy action parameter and update
    const actionParameter = NrcspSoap.ACTIONS_TEMPLATES.ConfigureSleepTimer;
    actionParameter.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    actionParameter.args[actionParameter.argsValueName] = newValue;
    const { baseUrl, path, name, action, args } = actionParameter;
    NrcspSoap.sendToPlayerV1(baseUrl, path, name, action, args)
      .then((response) => {
        if (response.statusCode === 200) { // // maybe not necessary as promise will throw error
          return NrcspSoap.parseSoapBody(response.body);
        } else {
          throw new Error('n-r-c-s-p: status code: ' + response.statusCode + '-- body:' + JSON.stringify(response.body));
        }
      })
      .then((bodyXML) => { // verify response, now in JSON format
        // safely access property,  Oliver Steele's pattern
        const paths = actionParameter.responsePath;
        const result = paths.reduce((object, path) => {
          return (object || {})[path];
        }, bodyXML);
        if (result !== actionParameter.responseValue) {
          throw new Error('n-r-c-s-p: got error message from player: ' + JSON.stringify(bodyXML));
        }
        return true;
      })
      .then(() => {
        // msg not modified
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Sets the sleep timer.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *         {String} msg.topic format hh:mm:ss hh < 20
  * @param  {Object} sonosPlayer Sonos Player
  * @output: {Object} msg unmodified / stopped in case of error
  */
  // function configureSleepTimer (node, msg, sonosPlayer) {
  //   const sonosFunction = 'set/configure sleep timer';
  //
  //   // validate msg.topic
  //   if (!NrcspHelper.isValidPropertyNotEmptyString(msg, ['topic'])) {
  //     NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
  //     return;
  //   }
  //   const newValue = msg.topic;
  //   if (!NrcspHelper.REGEX_TIME.test(newValue)) {
  //     NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: msg.topic must have format hh:mm:ss, hh < 20'), sonosFunction);
  //     return;
  //   }
  //   // execute command
  //   const baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
  //   NcrspSonos.setCmdBasic(baseUrl, 'ConfigureSleepTimer', newValue)
  //     .then(() => {
  //       // msg not modified
  //       NrcspHelper.success(node, msg, sonosFunction);
  //     })
  //     .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  // }

  /**  LAB: Test new features, error messsages, ...
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  */
  function labTest (node, msg, sonosPlayer) {

  }
  RED.nodes.registerType('sonos-control-player', SonosControlPlayerNode);
};
