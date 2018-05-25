const retryPromise  = require('retry-promise').default
import {
  log,
}                       from '../config'

import PuppetPadchat    from './puppet-padchat'

import {
  Message,
}                       from '../message'
import {
  Contact,
}                       from '../contact'

/* tslint:disable:variable-name */
export const Firer = {
  // checkFriendConfirm,
  // checkFriendRequest,

  checkRoomJoin,
  checkRoomLeave,
  checkRoomTopic,

  // parseFriendConfirm,
  parseRoomJoin,
  parseRoomLeave,
  parseRoomTopic,

}

const regexConfig = {
  // friendConfirm: [
  //   /^You have added (.+) as your WeChat contact. Start chatting!$/,
  //   /^你已添加了(.+)，现在可以开始聊天了。$/,
  //   /^(.+) just added you to his\/her contacts list. Send a message to him\/her now!$/,
  //   /^(.+)刚刚把你添加到通讯录，现在可以开始聊天了。$/,
  // ],

  roomJoinInvite: [
    // There are 3 blank(charCode is 32) here. eg: You invited 管理员 to the group chat.
    /^(.+?) invited (.+) to the group chat.\s+$/,

    // There no no blank or punctuation here.  eg: 管理员 invited 小桔建群助手 to the group chat
    /^(.+?) invited (.+) to the group chat$/,

    // There are 2 blank(charCode is 32) here. eg: 你邀请"管理员"加入了群聊
    /^(.+?)邀请"(.+)"加入了群聊\s+$/,

    // There no no blank or punctuation here.  eg: "管理员"邀请"宁锐锋"加入了群聊
    /^"(.+?)"邀请"(.+)"加入了群聊$/,
  ],

  roomJoinQrcode: [
    // Wechat change this, should desperate. See more in pr#651
    // /^" (.+)" joined the group chat via the QR Code shared by "?(.+?)".$/,

    // There are 2 blank(charCode is 32) here. Qrcode is shared by bot.     eg: "管理员" joined group chat via the QR code you shared.
    /^"(.+)" joined group chat via the QR code "?(.+?)"? shared.\s+$/,

    // There are no blank(charCode is 32) here. Qrcode isn't shared by bot. eg: "宁锐锋" joined the group chat via the QR Code shared by "管理员".
    /^"(.+)" joined the group chat via the QR Code shared by "?(.+?)".$/,

    // There are 2 blank(charCode is 32) here. Qrcode is shared by bot.     eg: "管理员"通过扫描你分享的二维码加入群聊
    /^"(.+)"通过扫描(.+?)分享的二维码加入群聊\s+$/,

    // There are 1 blank(charCode is 32) here. Qrode isn't shared by bot.  eg: " 苏轼"通过扫描"管理员"分享的二维码加入群聊
    /^"\s+(.+)"通过扫描"(.+?)"分享的二维码加入群聊$/,
  ],

  // no list
  roomLeaveByBot: [
    /^You removed "(.+)" from the group chat$/,
    /^你将"(.+)"移出了群聊$/,
  ],

  roomLeaveByOther: [
    /^You were removed from the group chat by "(.+)"$/,
    /^你被"(.+)"移出群聊$/,
  ],

  roomTopic: [
    /^"?(.+?)"? changed the group name to "(.+)"$/,
    /^"?(.+?)"?修改群名为“(.+)”$/,
  ],
}

// async function checkFriendRequest(
//   this       : PuppetPadchat,
//   rawPayload : WebMessageRawPayload,
// ): Promise<void> {
//   if (!rawPayload.RecommendInfo) {
//     throw new Error('no RecommendInfo')
//   }
//   const recommendInfo: WebRecomendInfo = rawPayload.RecommendInfo
//   log.verbose('PuppetPadchatFirer', 'fireFriendRequest(%s)', recommendInfo)

//   if (!recommendInfo) {
//     throw new Error('no recommendInfo')
//   }

//   const contact   = this.Contact.load(recommendInfo.UserName)
//   contact.puppet  = this

//   const hello = recommendInfo.Content
//   const ticket = recommendInfo.Ticket

//   await contact.ready()
//   if (!contact.isReady()) {
//     log.warn('PuppetPadchatFirer', 'fireFriendConfirm() contact still not ready after `ready()` call')
//   }

//   const receivedRequest = this.FriendRequest.createReceive(
//     contact,
//     hello,
//     ticket,
//   )

//   this.emit('friend', receivedRequest)
// }

/**
 * try to find FriendRequest Confirmation Message
 */
// function parseFriendConfirm(
//   this: PuppetPadchat,
//   content: string,
// ): boolean {
//   const reList = regexConfig.friendConfirm
//   let found = false

//   reList.some(re => !!(found = re.test(content)))
//   if (found) {
//     return true
//   } else {
//     return false
//   }
// }

// async function checkFriendConfirm(
//   this: PuppetPadchat,
//   m: Message,
// ) {
//   const content = m.text()
//   log.silly('PuppetPadchatFirer', 'fireFriendConfirm(%s)', content)

//   if (!parseFriendConfirm.call(this, content)) {
//     return
//   }

//   const contact = m.from()

//   const confirmedRequest = this.FriendRequest.createConfirm(
//     contact,
//   )

//   await contact.ready()
//   if (!contact.isReady()) {
//     log.warn('PuppetPadchatFirer', 'fireFriendConfirm() contact still not ready after `ready()` call')
//   }

//   this.emit('friend', confirmedRequest)
// }

/**
 * try to find 'join' event for Room
 *
 * 1.
 *  You invited 管理员 to the group chat.
 *  You invited 李卓桓.PreAngel、Bruce LEE to the group chat.
 * 2.
 *  管理员 invited 小桔建群助手 to the group chat
 *  管理员 invited 庆次、小桔妹 to the group chat
 */
function parseRoomJoin(
  this: PuppetPadchat,
  content: string,
): [string[], string] {
  log.verbose('PuppetPadchatFirer', 'checkRoomJoin(%s)', content)

  const reListInvite = regexConfig.roomJoinInvite
  const reListQrcode = regexConfig.roomJoinQrcode

  let foundInvite: string[]|null = []
  reListInvite.some(re => !!(foundInvite = content.match(re)))
  let foundQrcode: string[]|null = []
  reListQrcode.some(re => !!(foundQrcode = content.match(re)))
  if ((!foundInvite || !foundInvite.length) && (!foundQrcode || !foundQrcode.length)) {
    throw new Error('checkRoomJoin() not found matched re of ' + content)
  }
  /**
   * 管理员 invited 庆次、小桔妹 to the group chat
   * "管理员"通过扫描你分享的二维码加入群聊
   */
  const [inviter, inviteeStr] = foundInvite ? [ foundInvite[1], foundInvite[2] ] : [ foundQrcode[2], foundQrcode[1] ]
  const inviteeList = inviteeStr.split(/、/)

  return [inviteeList, inviter] // put invitee at first place
}

async function checkRoomJoin(
  this: PuppetPadchat,
  msg:  Message,
): Promise<boolean> {

  const room = msg.room()
  if (!room) {
    log.warn('PuppetPadchatFirer', 'fireRoomJoin() `room` not found')
    return false
  }

  const text = msg.text()

  let inviteeList: string[], inviter: string
  try {
    [inviteeList, inviter] = parseRoomJoin.call(this, text)
  } catch (e) {
    log.silly('PuppetPadchatFirer', 'fireRoomJoin() "%s" is not a join message', text)
    return false // not a room join message
  }
  log.silly('PuppetPadchatFirer', 'fireRoomJoin() inviteeList: %s, inviter: %s',
                              inviteeList.join(','),
                              inviter,
          )

  let inviterContact: Contact | null = null
  let inviteeContactList: Contact[] = []

  try {
    if (inviter === 'You' || inviter === '你' || inviter === 'you') {
      inviterContact = this.userSelf()
    }

    const max = 20
    const backoff = 300
    const timeout = max * (backoff * max) / 2
    // 20 / 300 => 63,000
    // max = (2*totalTime/backoff) ^ (1/2)
    // timeout = 11,250 for {max: 15, backoff: 100}

    await retryPromise({ max: max, backoff: backoff }, async (attempt: number) => {
      log.silly('PuppetPadchatFirer', 'fireRoomJoin() retryPromise() attempt %d with timeout %d', attempt, timeout)

      await room.refresh()
      let inviteeListAllDone = true

      for (const i in inviteeList) {
        const loaded = inviteeContactList[i] instanceof Contact

        if (!loaded) {
          const c = room.member(inviteeList[i])
          if (!c) {
            inviteeListAllDone = false
            continue
          }

          await c.ready()
          inviteeContactList[i] = c

          const isReady = c.isReady()
          if (!isReady) {
            inviteeListAllDone = false
            continue
          }
        }

        if (inviteeContactList[i] instanceof Contact) {
          const isReady = inviteeContactList[i].isReady()
          if (!isReady) {
            log.warn('PuppetPadchatFirer', 'fireRoomJoin() retryPromise() isReady false for contact %s', inviteeContactList[i].id)
            inviteeListAllDone = false
            await inviteeContactList[i].refresh()
            continue
          }
        }

      }

      if (!inviterContact) {
        inviterContact = room.member(inviter)
      }

      if (inviteeListAllDone && inviterContact) {
        log.silly('PuppetPadchatFirer', 'fireRoomJoin() resolve() inviteeContactList: %s, inviterContact: %s',
                                    inviteeContactList.map((c: Contact) => c.name()).join(','),
                                    inviterContact.name(),
                )
        return true
      }

      log.error('PuppetPadchatFirer', 'fireRoomJoin() not found(yet)')
      return false
      // throw new Error('not found(yet)')

    }).catch((e: Error) => {
      log.warn('PuppetPadchatFirer', 'fireRoomJoin() reject() inviteeContactList: %s, inviterContact: %s, error %s',
                                 inviteeContactList.map((c: Contact) => c.name()).join(','),
                                 inviter,
                                 e.message,
      )
    })

    if (!inviterContact) {
      log.error('PuppetPadchatFirer', 'firmRoomJoin() inivter not found for %s , `room-join` & `join` event will not fired', inviter)
      return false
    }
    if (!inviteeContactList.every(c => c instanceof Contact)) {
      log.error('PuppetPadchatFirer', 'firmRoomJoin() inviteeList not all found for %s , only part of them will in the `room-join` or `join` event',
                                  inviteeContactList.join(','),
              )
      inviteeContactList = inviteeContactList.filter(c => (c instanceof Contact))
      if (inviteeContactList.length < 1) {
        log.error('PuppetPadchatFirer', 'firmRoomJoin() inviteeList empty.  `room-join` & `join` event will not fired')
        return false
      }
    }

    await Promise.all(inviteeContactList.map(c => c.ready()))
    await inviterContact.ready()
    await room.ready()

    this.emit('room-join', room , inviteeContactList, inviterContact)
    room.emit('join'            , inviteeContactList, inviterContact)

    return true
  } catch (e) {
    log.error('PuppetPadchatFirer', 'exception: %s', e.stack)
    return false
  }

}

function parseRoomLeave(
  this: PuppetPadchat,
  content: string,
): [string, string] {
  const reListByBot = regexConfig.roomLeaveByBot
  const reListByOther = regexConfig.roomLeaveByOther
  let foundByBot: string[]|null = []
  reListByBot.some(re => !!(foundByBot = content.match(re)))
  let foundByOther: string[]|null = []
  reListByOther.some(re => !!(foundByOther = content.match(re)))
  if ((!foundByBot || !foundByBot.length) && (!foundByOther || !foundByOther.length)) {
    throw new Error('checkRoomLeave() no matched re for ' + content)
  }
  const [leaver, remover] = foundByBot ? [ foundByBot[1], this.userSelf().id ] : [ this.userSelf().id, foundByOther[1] ]
  return [leaver, remover]
}

/**
 * You removed "Bruce LEE" from the group chat
 */
async function checkRoomLeave(
  this: PuppetPadchat,
  m:    Message,
): Promise<boolean> {
  log.verbose('PuppetPadchatFirer', 'fireRoomLeave(%s)', m.text())

  let leaver: string, remover: string
  try {
    [leaver, remover] = parseRoomLeave.call(this, m.text())
  } catch (e) {
    return false
  }
  log.silly('PuppetPadchatFirer', 'fireRoomLeave() got leaver: %s', leaver)

  const room = m.room()
  if (!room) {
    log.warn('PuppetPadchatFirer', 'fireRoomLeave() room not found')
    return false
  }
  /**
   * FIXME: leaver maybe is a list
   * @lijiarui: I have checked, leaver will never be a list. If the bot remove 2 leavers at the same time, it will be 2 sys message, instead of 1 sys message contains 2 leavers.
   */
  let leaverContact: Contact | null, removerContact: Contact | null
  if (leaver === this.userSelf().id) {
    leaverContact = this.userSelf()

    // not sure which is better
    // removerContact = room.member({contactAlias: remover}) || room.member({name: remover})
    removerContact = room.member(remover)
    // if (!removerContact) {
    //   log.error('PuppetPadchatFirer', 'fireRoomLeave() bot is removed from the room, but remover %s not found, event `room-leave` & `leave` will not be fired', remover)
    //   return false
    // }

  } else {
    removerContact = this.userSelf()

    // not sure which is better
    // leaverContact = room.member({contactAlias: remover}) || room.member({name: leaver})
    leaverContact = room.member(remover)
    if (!leaverContact) {
      log.error('PuppetPadchatFirer', 'fireRoomLeave() bot removed someone from the room, but leaver %s not found, event `room-leave` & `leave` will not be fired', leaver)
      return false
    }
  }

  if (removerContact) {
    await removerContact.ready()
  }
  await leaverContact.ready()
  await room.ready()

  /**
   * FIXME: leaver maybe is a list
   * @lijiarui 2017: I have checked, leaver will never be a list. If the bot remove 2 leavers at the same time,
   *                  it will be 2 sys message, instead of 1 sys message contains 2 leavers.
   * @huan 2018 May: we need to generilize the pattern for future usage.
   */
  this.emit('room-leave', room, [leaverContact] /* , [removerContact] */)
  room.emit('leave'           , [leaverContact], removerContact || undefined)

  setTimeout(_ => { room.refresh() }, 10000) // reload the room data, especially for memberList
  return true
}

function parseRoomTopic(
  this: PuppetPadchat,
  content: string,
): [string, string] {
  const reList = regexConfig.roomTopic

  let found: string[]|null = []
  reList.some(re => !!(found = content.match(re)))
  if (!found || !found.length) {
    throw new Error('checkRoomTopic() not found')
  }
  const [, changer, topic] = found
  return [topic, changer]
}

async function checkRoomTopic(
  this: PuppetPadchat,
  m: Message): Promise<boolean> {
  let  topic, changer
  try {
    [topic, changer] = parseRoomTopic.call(this, m.text())
  } catch (e) { // not found
    return false
  }

  const room = m.room()
  if (!room) {
    log.warn('PuppetPadchatFirer', 'fireRoomLeave() room not found')
    return false
  }

  const oldTopic = room.topic()

  let changerContact: Contact | null
  if (/^You$/.test(changer) || /^你$/.test(changer)) {
    changerContact = this.userSelf()
  } else {
    changerContact = room.member(changer)
  }

  if (!changerContact) {
    log.error('PuppetPadchatFirer', 'fireRoomTopic() changer contact not found for %s', changer)
    return false
  }

  try {
    await changerContact.ready()
    await room.ready()
    this.emit('room-topic', room, topic, oldTopic, changerContact)
    room.emit('topic'           , topic, oldTopic, changerContact)
    room.refresh()
    return true
  } catch (e) {
    log.error('PuppetPadchatFirer', 'fireRoomTopic() co exception: %s', e.stack)
    return false
  }
}

export default Firer
