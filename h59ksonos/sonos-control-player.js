var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosControlPlayerNode (config) {
    RED.nodes.createNode(this, config);

    // verify config node. if valid then set status and process message
    var node = this;
    var configNode = RED.nodes.getNode(config.confignode);
    var isValid = helper.validateConfigNode(node, configNode);
    if (isValid) {
      // clear node status
      node.status({});

      // handle input message
      node.on('input', function (msg) {
        helper.preprocessInputMsg(node, configNode, msg, function (device) {
          handleInputMsg(node, configNode, msg, device.ipaddress);
        });
      });
    }
  }

  // ------------------------------------------------------------------------------------

  function handleInputMsg (node, configNode, msg, ipaddress) {
    // get sonos player
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (sonosPlayer === null || sonosPlayer === undefined) {
      node.status({ fill: 'red', shape: 'dot', text: 'sonos player is null' });
      node.error('sonos player is null');
      return;
    }

    // Check msg.payload and convert to lowercase string
    if (!(msg.payload !== null && msg.payload !== undefined && msg.payload)) {
      node.status({ fill: 'red', shape: 'dot', text: 'wrong payload' });
      node.error('invalid payload!');
      return;
    }
    var command = msg.payload;
    command = '' + command;// convert to string
    command = command.toLowerCase();
    var splitCommand;

    var commandList = ['play', 'pause', 'stop', 'toggleplayback', 'mute', 'unmute'];
    // Handle simple string command format, rather than specific JSON format previously
    if (commandList.indexOf(command) > -1) {
      handleCommand(node, configNode, msg, sonosPlayer, command);
    } else if (command.startsWith('+') && !isNaN(parseInt(command)) && parseInt(command) > 0 && parseInt(command) <= 30) {
      splitCommand = { function: 'volume_up', parameter: parseInt(command) };
      handleVolumeCommand(node, configNode, msg, sonosPlayer, splitCommand);
    } else if (command.startsWith('-') && !isNaN(parseInt(command)) && parseInt(command) < 0 && parseInt(command) >= -30) {
      splitCommand = { function: 'volume_down', parameter: parseInt(command) };
      handleVolumeCommand(node, configNode, msg, sonosPlayer, splitCommand);
    } else if (!isNaN(parseInt(command)) && parseInt(command) >= 0 && parseInt(command) <= 100) {
      splitCommand = { function: 'volume_set', parameter: parseInt(command) };
      handleVolumeCommand(node, configNode, msg, sonosPlayer, splitCommand);
    } else {
      node.status({ fill: 'red', shape: 'dot', text: 'invalid command!' });
      node.warn('invalid command: ' + command);
    }
  }

  // ------------------------------------------------------------------------------------

  function handleCommand (node, configNode, msg, sonosPlayer, cmd) {
    switch (cmd) {
      case 'play':
        sonosPlayer.play().then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK- play' });
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'Error play' });
          node.error('Error play: ' + JSON.stringify(err));
        });
        break;

      case 'stop':
        sonosPlayer.stop().then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK- stop' });
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'Error stop' });
          node.error('Error stop: ' + JSON.stringify(err));
        });
        break;

      case 'pause':
        sonosPlayer.pause().then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK- pause' });
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'Error pause' });
          node.error('Error pause: ' + JSON.stringify(err));
        });
        break;

      case 'toggleplayback':
        sonosPlayer.togglePlayback().then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK- toggleplayback' });
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'Error toggleplayback' });
          node.error('Error toggleplayback: ' + JSON.stringify(err));
        });
        break;

      case 'mute':
        sonosPlayer.setMuted(true).then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK- mute' });
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'Error mute' });
          node.error('Error mute: ' + JSON.stringify(err));
        });
        break;
      case 'unmute':
        sonosPlayer.setMuted(false).then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK- unmute' });
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'Error unmute' });
          node.error('Error unmute: ' + JSON.stringify(err));
        });
        break;
    }
  }

  function handleVolumeCommand (node, configNode, msg, sonosPlayer, command) {
    // command.parameter is assumed to be a valid number and in right range!
    var volumeValue = parseInt(command.parameter);
    switch (command.function) {
      case 'volume_set':
        sonosPlayer.setVolume(volumeValue).then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK- volume set' });
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'Error set volume.' });
          node.error('Error set volume ' + JSON.stringify(err));
        });
        break;

      case 'volume_down':
      case 'volume_up':
        sonosPlayer.adjustVolume(volumeValue).then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK- volume adjust' });
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'Error adjust volume' });
          node.error('Error adjust volume' + JSON.stringify(err));
        });
        break;
    }
  }
  RED.nodes.registerType('sonos-control-player', SonosControlPlayerNode);
};
