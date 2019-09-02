var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosControlPlayerNode (config) {
    /**  Create Control Player Node and subscribe to messages
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
      // subscribe and handle input message
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

  // ------------------------------------------------------------------------------------

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
      node.error('get sonosplayer - sonos player is null. Details: Check configuration.');
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
    var splitCommand;

    // dispatch
    const commandList = ['play', 'pause', 'stop', 'toggleplayback', 'mute', 'unmute', 'next_song', 'previous_song', 'join_group', 'leave_group'];
    if (commandList.indexOf(command) > -1) {
      handleCommandBasic(node, msg, sonosPlayer, command);
    } else if (command.startsWith('+') && !isNaN(parseInt(command)) && parseInt(command) > 0 && parseInt(command) <= 30) {
      splitCommand = { cmd: 'volume_increase', parameter: parseInt(command) };
      handleVolumeCommand(node, msg, sonosPlayer, splitCommand);
    } else if (command.startsWith('-') && !isNaN(parseInt(command)) && parseInt(command) < 0 && parseInt(command) >= -30) {
      splitCommand = { cmd: 'volume_decrease', parameter: parseInt(command) };
      handleVolumeCommand(node, msg, sonosPlayer, splitCommand);
    } else if (!isNaN(parseInt(command)) && parseInt(command) >= 0 && parseInt(command) <= 100) {
      splitCommand = { cmd: 'volume_set', parameter: parseInt(command) };
      handleVolumeCommand(node, msg, sonosPlayer, splitCommand);
    } else if (command === 'play_avtransport') {
      // TODO error handling topic
      let sonosFunction = command;
      let errorShort = '';
      sonosPlayer.setAVTransportURI(msg.topic).then(response => {
        node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
        node.debug(`ok:${sonosFunction}`);
        // send message
        node.send(msg);
      }).catch(err => {
        errorShort = 'caught error from seAVTransportURI';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
        node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
      });
    } else {
      node.status({ fill: 'green', shape: 'dot', text: 'warning:depatching commands - invalid command' });
      node.warn('depatching commands - invalid command: ' + command);
    }
  }

  // ------------------------------------------------------------------------------------

  function handleCommandBasic (node, msg, sonosPlayer, cmd) {
    /**  Initiate basic (no parameter) commands to control sonos player
    * @param  {Object} node current node
    * @param  {object} msg incoming message
    * @param  {object} sonosPlayer Sonos Player
    * @param  {string} cmd command - no parameter
    */

    var sonosFunction = cmd;
    var errorShort;
    switch (cmd) {
      case 'play':
        sonosPlayer.play().then(response => {
          node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
          node.debug(`ok:${sonosFunction}`);
        }).catch(err => {
          if (err.code === 'ECONNREFUSED') {
            errorShort = 'can not connect to player';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: Verify IP address of player.`);
          } else {
            errorShort = 'error caught from response';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
          }
        });
        break;

      case 'stop':
        sonosPlayer.stop().then(response => {
          node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
          node.debug(`ok:${sonosFunction}`);
        }).catch(err => {
          if (err.code === 'ECONNREFUSED') {
            errorShort = 'can not connect to player';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: Verify IP address of player.`);
          } else {
            errorShort = 'error caught from response';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
          }
        });
        break;

      case 'pause':
        sonosPlayer.pause().then(response => {
          node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
          node.debug(`ok:${sonosFunction}`);
        }).catch(err => {
          if (err.code === 'ECONNREFUSED') {
            errorShort = 'can not connect to player';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: Verify IP address of player.`);
          } else {
            errorShort = 'error caught from response';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
          }
        });
        break;

      case 'toggleplayback':
        sonosPlayer.togglePlayback().then(response => {
          node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
          node.debug(`ok:${sonosFunction}`);
        }).catch(err => {
          if (err.code === 'ECONNREFUSED') {
            errorShort = 'can not connect to player';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: Verify IP address of player.`);
          } else {
            errorShort = 'error caught from response';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
          }
        });
        break;

      case 'mute':
        sonosPlayer.setMuted(true).then(response => {
          node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
          node.debug(`ok:${sonosFunction}`);
        }).catch(err => {
          if (err.code === 'ECONNREFUSED') {
            errorShort = 'can not connect to player';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: Verify IP address of player.`);
          } else {
            errorShort = 'error caught from response';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
          }
        });
        break;

      case 'unmute':
        sonosPlayer.setMuted(false).then(response => {
          node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
          node.debug(`ok:${sonosFunction}`);
        }).catch(err => {
          if (err.code === 'ECONNREFUSED') {
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - can not connect to player` });
            node.error(`${sonosFunction} - can not connect to player`);
          } else {
            errorShort = 'error caught from response';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
          }
        });
        break;

      case 'next_song':
        // TODO handle next: in queue, there must be a next song, in radion station previous never works
        sonosPlayer.next().then(response => {
          node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
          node.debug(`ok:${sonosFunction}`);
        }).catch(err => {
          if (err.code === 'ECONNREFUSED') {
            errorShort = 'can not connect to player';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: Verify IP address of player.`);
          } else {
            errorShort = 'error caught from response';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
          }
        });
        break;

      case 'previous_song':
      // TODO handle next: in queue, there must be a next song, in radion station previous never works
        sonosPlayer.previous(false).then(response => {
          node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
          node.debug(`ok:${sonosFunction}`);
        }).catch(err => {
          if (err.code === 'ECONNREFUSED') {
            errorShort = 'can not connect to player';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: Verify IP address of player.`);
          } else {
            errorShort = 'error caught from response';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
          }
        });
        break;

      case 'leave_group':
        sonosPlayer.leaveGroup().then(response => {
          node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
          node.debug(`ok:${sonosFunction}`);
        }).catch(err => {
          if (err.code === 'ECONNREFUSED') {
            errorShort = 'can not connect to player';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: Verify IP address of player.`);
          } else {
            errorShort = 'error caught from response';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
          }
        });
        break;

      case 'join_group':
        if (msg.topic === null || msg.topic === undefined) {
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - no valid topic` });
          node.error(`${sonosFunction} - no valid topic`);
        } else {
          var deviceToJoing = msg.topic;
          sonosPlayer.joinGroup(deviceToJoing).then(response => {
            node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
            node.debug(`ok:${sonosFunction}`);
          }).catch(err => {
            if (err.code === 'ECONNREFUSED') {
              errorShort = 'can not connect to player';
              node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
              node.error(`${sonosFunction} - ${errorShort} Details: Verify IP address of player.`);
            } else {
              errorShort = 'error caught from response';
              node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
              node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
            }
          });
        }
        break;
    }
  }

  function handleVolumeCommand (node, msg, sonosPlayer, commandObject) {
    /**  Initiate volume commands with one parameter to control sonos player
    * @param  {Object} node current node
    * @param  {object} msg incoming message
    * @param  {object} sonosPlayer Sonos Player
    * @param  {object} commandObject command - cmd and parameter !! Valid number
    */

    var volumeValue = parseInt(commandObject.parameter);
    const sonosFunction = commandObject.cmd;
    var errorShort;
    switch (commandObject.cmd) {
      case 'volume_set':
        sonosPlayer.setVolume(volumeValue).then(response => {
          node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}  to ${volumeValue}` });
          node.debug(`ok:${sonosFunction} ${volumeValue}`);
        }).catch(err => {
          if (err.code === 'ECONNREFUSED') {
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - can not connect to player` });
            node.error(`${sonosFunction} - can not connect to player`);
          } else {
            errorShort = 'error caught from response';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
          }
        });
        break;

      case 'volume_decrease':
      case 'volume_increase':
        sonosPlayer.adjustVolume(volumeValue).then(response => {
          node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
          node.debug(`ok:${sonosFunction}`);
        }).catch(err => {
          if (err.code === 'ECONNREFUSED') {
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - can not connect to player` });
            node.error(`${sonosFunction} - can not connect to player`);
          } else {
            errorShort = 'error caught from response';
            node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
            node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
          }
        });
        break;
    }
  }
  RED.nodes.registerType('sonos-control-player', SonosControlPlayerNode);
};
