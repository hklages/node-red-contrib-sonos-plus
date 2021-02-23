const { extractGroup }
  = require('../src/Commands.js')

const { describe, it } = require('mocha')
const { expect } = require('chai')

describe('extractGroup function', () => {

  it('no player name, playerHostname coordinator ', async () => {
    const playerHostname = '192.1681.78.37'
    const playerName = ''
    const allGroupsData = [
      [
        {
          groupId: 'RINCON_5CAAFD00223601400:510',
          uuid: 'RINCON_5CAAFD00223601400',
          url: [URL],
          playerName: 'Küche',
          invisible: false,
          channelMapSet: ''
        },
        {
          url: [URL],
          playerName: 'Bad',
          uuid: 'RINCON_000E58FE3AEA01400',
          groupId: 'RINCON_5CAAFD00223601400:510',
          invisible: false,
          channelMapSet: ''
        }
      ],
      [
        {
          groupId: 'RINCON_949F3EC13B9901400:318748238',
          uuid: 'RINCON_949F3EC13B9901400',
          url: [URL],
          playerName: 'Wohnzimmer',
          invisible: false,
          channelMapSet: ''
        }
      ]
    ]
    const result = await extractGroup(playerHostname, allGroupsData, playerName)
    expect(result.groupId)
      .equal('RINCON_5CAAFD00223601400')
  })

  it('no player name, playerHostname no-coordinator ', async () => {
    const playerHostname = '192.1681.78.36'
    const playerName = ''
    const allGroupsData = [
      [
        {
          groupId: 'RINCON_5CAAFD00223601400:510',
          uuid: 'RINCON_5CAAFD00223601400',
          url: [URL],
          playerName: 'Küche',
          invisible: false,
          channelMapSet: ''
        },
        {
          url: [URL],
          playerName: 'Bad',
          uuid: 'RINCON_000E58FE3AEA01400',
          groupId: 'RINCON_5CAAFD00223601400:510',
          invisible: false,
          channelMapSet: ''
        }
      ],
      [
        {
          groupId: 'RINCON_949F3EC13B9901400:318748238',
          uuid: 'RINCON_949F3EC13B9901400',
          url: [URL],
          playerName: 'Wohnzimmer',
          invisible: false,
          channelMapSet: ''
        }
      ]
    ]
    const result = await extractGroup(playerHostname, allGroupsData, playerName)
    expect(result.groupId)
      .equal('RINCON_5CAAFD00223601400')
  })

})