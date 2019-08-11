var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  // TODO name Node and variable n ? overwork
  function SonosGetStatusNode (config) {
    RED.nodes.createNode(this, config);

    // verify config node. if valid then set status and process message
    var node = this;
    var configNode = RED.nodes.getNode(config.confignode);
    var isValid = helper.validateConfigNode(node, configNode);
    if (isValid) {
      // clear node status
      node.status({});

      // handle input message (the different requests are chained)
      node.on('input', function (msg) {
        helper.preprocessInputMsg(node, configNode, msg, function (device) {
          getSonosCurrentState(node, msg, device.ipaddress);
        });
      });
    }
  }

  // ------------------------------------------------------------------------------------------

  function getSonosCurrentState (node, msg, ipaddress) {
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (sonosPlayer === null || sonosPlayer === undefined) {
      node.status({ fill: 'red', shape: 'dot', text: 'sonos player is null' });
    } else {
      sonosPlayer.getCurrentState().then(state => {
        if (state === null || state === undefined) {
          node.status({ fill: 'red', shape: 'dot', text: 'invalid current state retrieved' });
        } else {
          msg.state = state;
          if (msg.payload === 'state_only') {
            node.send(msg);
          } else {
            getSonosCurrentTrack(node, msg, ipaddress);
          }
        }
      }).catch(err => {
        node.error(JSON.stringify(err));
        node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve current state' });
      });
    }
  }

  function getSonosCurrentTrack (node, msg, ipaddress) {
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (sonosPlayer === null || sonosPlayer === undefined) {
      node.status({ fill: 'red', shape: 'dot', text: 'sonos player is null' });
    } else {
      sonosPlayer.currentTrack().then(trackObj => {
        if (trackObj === null || trackObj === undefined) {
          node.status({ fill: 'red', shape: 'dot', text: 'invalid current track retrieved' });
        } else {
          // message albumArtURL property
          if (trackObj.albumArtURI !== undefined && trackObj.albumArtURI !== null) {
            var port = 1400;
            trackObj.albumArtURL = 'http://' + ipaddress + ':' + port + trackObj.albumArtURI;
          }
          if (trackObj.artist !== undefined && trackObj.artist !== null) {
            msg.artist = trackObj.artist;
            msg.title = trackObj.title;
          } else {
            if (trackObj.title.indexOf(' - ') > 0) {
              msg.artist = trackObj.title.split(' - ')[0];
              msg.title = trackObj.title.split(' - ')[1];
            } else {
              msg.artist = 'nicht verfügbar';
              msg.title = 'nicht verfügbar';
            }
          }
          // Output data
          msg.track = trackObj;
          getSonosVolume(node, msg, ipaddress);
        }
      }).catch(err => {
        node.error(JSON.stringify(err));
        node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve current track' });
      });
    }
  }

  function getSonosVolume (node, msg, ipaddress) {
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (sonosPlayer === null || sonosPlayer === undefined) {
      node.status({ fill: 'red', shape: 'dot', text: 'sonos player is null' });
      return;
    }

    sonosPlayer.getVolume().then(volume => {
      if (volume === null || volume === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid volume retrieved' });
        return;
      }
      if (volume < 0 || volume > 100) {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid volume range retrieved' });
        return;
      }
      // Output data
      msg.volume = volume;
      msg.normalized_volume = volume / 100.0;
      getSonosMuted(node, msg, ipaddress);
    }).catch(err => {
      node.error(JSON.stringify(err));
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve volume' });
    });
  }

  function getSonosMuted (node, msg, ipaddress) {
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (sonosPlayer === null || sonosPlayer === undefined) {
      node.status({ fill: 'red', shape: 'dot', text: 'sonos player is null' });
      return;
    }

    sonosPlayer.getMuted().then(muted => {
      if (muted === null || muted === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid Mute status retrieved' });
      } else {
      // volume + current track
        var text = '';
        if (muted) {
          text += 'muted • ';
        }
        text += 'vol:' + msg.volume;
        if (msg.payload) {
          text += ' • ' + msg.payload;
        }
        node.status({ fill: 'green', shape: 'dot', text: text });
      }
      // Output data
      msg.muted = muted;

      // Send output
      node.send(msg);
    }).catch(err => {
      node.error(JSON.stringify(err));
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve Mute status' });
    });
  }

  RED.nodes.registerType('sonos-get-status', SonosGetStatusNode);
};
