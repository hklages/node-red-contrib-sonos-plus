'use strict';

module.exports = class SonosHelper {
  // functions to be used in other modules

  /** Validate configNode.
  * @param  {object} configNode corresponding configNode
  * @return {Boolean} true if: object not null, not undefined and either ipaddress with corect syntax  or serial exists
  */
  validateConfigNodeV3 (configNode) {
    if (typeof configNode === 'undefined' || configNode === null ||
      (typeof configNode === 'number' && isNaN(configNode)) || configNode === '') {
      return false;
    }
    // minimum ip adddres: 1.1.1.1 (lenght 7)
    if (typeof configNode.ipaddress === 'undefined' || configNode.ipaddress === null ||
      (typeof configNode.ipaddress === 'number' && isNaN(configNode.ipaddress)) || (configNode.ipaddress.trim()).length < 7) {
      return !(typeof configNode.serialnum === 'undefined' || configNode.serialnum === null ||
                (typeof configNode.serialnum === 'number' && isNaN(configNode.serialnum)) || (configNode.serialnum.trim()).length < 19);
    } else {
      const IPREGEX = /^(?:(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])(\.(?!$)|$)){4}$/;
      if ((configNode.ipaddress.trim()).match(IPREGEX)) {
        // prefered case: valid ip address
        return true;
      } else {
        // 5C-AA-FD-00-22-36:1 (length 19)
        return !(typeof configNode.serialnum === 'undefined' || configNode.serialnum === null ||
                (typeof configNode.serialnum === 'number' && isNaN(configNode.serialnum)) || (configNode.serialnum.trim()).length < 19);
      }
    }
  }

  /** Returns sonos player object in callback.
  * @param  {Object} node current node to set status and send error
  * @param  {Object} configNode corresponding configNode
  * @param  {Object} msg received message
  * @param  {function} callback callback function with paramenter ipaddress - can be null
  * prereq: expecting that configNode has been validated for this input message
  * In case callback is missing or not a function -> return
  */
  identifyPlayerProcessInputMsg (node, configNode, msg, callback) {
    // use IP Address if user set it
    const sonosFunction = 'identify player';
    let msgShort = 'unknown';
    let msgDetails = 'unknown';

    if (!(typeof callback === 'function')) {
      this.showErrorV2(node, msg, new Error('n-r-c-s-p: Programming error - no callback', sonosFunction));
      return;
    }

    if (!(typeof configNode.ipaddress === 'undefined' || configNode.ipaddress === null ||
      (typeof configNode.ipaddress === 'number' && isNaN(configNode.ipaddress)) || configNode.ipaddress.trim().length < 7)) {
      // exisiting ip address - fastes solutions, no discovery necessary
      node.debug('using IP address of config node');
      callback(configNode.ipaddress);
    } else {
      // get ip address from serialnumber: start discovery returns ipaddress or null
      this.showWarning(node, sonosFunction, 'Missing IP address in config node', 'It is recommended to set IP Address in config node');

      this.findSonos(node, configNode.serialnum, function (err, ipAddress) {
        if (err) {
          // can not use showError
          msgShort = 'Dicovery went wrong';
          msgDetails = 'see debug';
          node.error(`${sonosFunction} - ${msgShort} :: Details: ${msgDetails}`, msg);
          node.status({ fill: 'red', shape: 'dot', text: `error: ${sonosFunction} - ${msgShort}` });
          node.debug(JSON.stringify(err));
          callback(null);
          return;
        }
        if (ipAddress === null) {
          msgShort = 'Could not find player';
          msgDetails = 'none';
          node.error(`${sonosFunction} - ${msgShort} :: Details: ${msgDetails}`, msg);
          node.status({ fill: 'red', shape: 'dot', text: `error: ${sonosFunction} - ${msgShort}` });
          callback(null);
        } else {
          // setting of nodestatus is done in following call handelIpuntMessage
          callback(ipAddress);
        }
      });
    }
  }

  /** Starts async discovery of sonos player and returns ipAddress - used in callback.
  * @param  {Object} node current node
  * @param  {string} serialNumber player serial number
  * @param  {function} callback function with parameter err, ipAddress
  * provides ipAddress or null (not found) and calls callback handling that.
  */
  findSonos (node, serialNumber, callback) {
    const sonos = require('sonos');

    node.debug('Start find Sonos player.');
    let ipAddress = null;

    // define discovery, find matching player and return ip
    const searchTime = 5000; // in miliseconds
    node.debug('Start searching for players');
    let discovery = sonos.DeviceDiscovery({ timeout: searchTime });

    discovery.on('DeviceAvailable', (sonosPlayer) => {
      // serial number is in deviceDescription serialNum
      // ipAddress is in sonosPlayer.host
      sonosPlayer.deviceDescription()
        .then(data => {
          // compary serial numbers
          if (!(typeof data.serialNum === 'undefined' || data.serialNum === null)) {
            if (data.serialNum.trim().toUpperCase() === serialNumber.trim().toUpperCase()) {
              node.debug('Found sonos player based on serialnumber in device description.');
              if (!(typeof sonosPlayer.host === 'undefined' || sonosPlayer.host === null)) {
                // success
                node.debug('Got ipaddres from device.host.');
                ipAddress = sonosPlayer.host;
                callback(null, ipAddress);
                node.debug('Cleanup disovery');
                if (!(typeof discovery === 'undefined' || discovery === null)) {
                  discovery.destroy();
                  discovery = null;
                }
              } else {
                // failure
                throw new Error('Found player but invalid ip address');
              }
            } else {
              // continue awaiting next players
            }
          } else {
            // failure but ignore and awaiting next player
          }
          return true;
        })
        .catch((error) => {
          callback(error, null);
          node.debug('Cleanup disovery - error');
          if (!(typeof discovery === 'undefined' || discovery === null)) {
            discovery.destroy();
            discovery = null;
          }
        });
    });

    // listener 'timeout' only once
    discovery.once('timeout', () => {
      node.debug('Received time out without finding any matching (serialnumber) sonos player');
      // error messages in calling function
      callback(null, null);
    });
  }

  /** show error status and error message - Version 2
  * @param  {Object} node current node
  * @param  {Object} msg current msg
  * @param  {Error object} error  error object from response
  * @param  {string} functionName name of calling function
  * @param  {string} messageShort  short message for status
  */
  showErrorV2 (node, msg, error, functionName) {
    let msgShort = 'unknown'; // default text
    let msgDetails = 'unknown'; // default text
    node.debug(`Entering error handling from ${functionName}`);

    // validate .code and check for ECONNREFUSED
    if (typeof error.code === 'undefined' || error.code === null ||
      (typeof error.code === 'number' && isNaN(error.code)) || error.code === '') {
      // Caution: getOwn is neccessary for some error messages eg playmode!
      if (typeof error.message === 'undefined' || error.message === null ||
        (typeof error.message === 'number' && isNaN(error.message)) || error.message === '') {
        msgDetails = JSON.stringify(error, Object.getOwnPropertyNames(error));
        msgShort = 'sonos-node / exception';
      } else {
        if (error.message.startsWith('n-r-c-s-p:')) {
          // handle my own error
          msgDetails = 'none';
          msgShort = error.message.replace('n-r-c-s-p: ', '');
        } else {
          // Caution: getOwn is neccessary for some error messages eg playmode!
          msgDetails = JSON.stringify(error, Object.getOwnPropertyNames(error));
          msgShort = error.message;
        }
      }
    } else {
      if (error.code === 'ECONNREFUSED') {
        msgShort = 'can not connect to player';
        msgDetails = 'Validate IP adress of player';
      } else {
        // Caution: getOwn is neccessary for some error messages eg playmode!
        msgShort = 'sonos-node / exception';
        msgDetails = JSON.stringify(error, Object.getOwnPropertyNames(error));
      }
    }

    node.error(`${functionName} - ${msgShort} :: Details: ${msgDetails}`, msg);
    node.status({ fill: 'red', shape: 'dot', text: `error: ${functionName} - ${msgShort}` });
  }

  /** show warning status and warn message
  * @param  {Object} node current node
  * @param  {string} functionName name of calling function
  * @param  {string} messageShort  short message for status
  * @param  {string} messageDetail  details
  */
  showWarning (node, functionName, messageShort, messageDetail) {
    node.debug(`Entering warning handling from ${functionName}`);
    node.warn(`Just a warning: ${functionName} - ${messageShort} :: Details: ` + messageDetail);
    node.status({ fill: 'blue', shape: 'dot', text: `warning: ${functionName} - ${messageShort}` });
  }

  /** show successful completion.
  * @param  {Object} node current node
  * @param  {string} functionName name of calling function
  */
  showSuccess (node, functionName) {
    node.status({ fill: 'green', shape: 'dot', text: `ok:${functionName}` });
    node.debug(`ok:${functionName}`);
  }
};
