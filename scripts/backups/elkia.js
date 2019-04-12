'use strict'
const ftp = require('basic-ftp')
const moment = require('moment')
const Discord = require('discord.js')
// const config = require('./config.dev.json')
const config = require('./config.json')
const client = new Discord.Client()
const prettyBytes = require('pretty-bytes')
const startTime = new Date()
const fs = require('fs')

// PROGRESS HANDLER
// TODO: API INTEGRATION SOMEHOW
let progress = { starting: true, latestItems: [], latestBytes: 0 }
let progressCounter
const handler = setInterval(function () { progressHandler() }, 5 * 1000)
async function progressHandler () {
  if (progress.starting) { //  ftp will usually start faster anyaway
    console.log('starting')
    return
  }
  if (progressCounter === undefined) {
    progressCounter = 1
  } else {
    progressCounter++
  }
  if (message !== undefined) {
    let files = progress.latestItems
    let fileSet = [...new Set(files)].join(', ').substring(0, 960) // There's a limit of 1000 chars. Found out the hard way.
    fileSet = fileSet.length >= 960 ? fileSet + '... and more.' : fileSet
    let speed = (progress.info.bytesOverall - progress.latestBytes) / 5
    let avgspeed = progress.info.bytesOverall / (progressCounter * 5)
    progress.latestItems = []
    let embed = await new Discord.RichEmbed()
      .setAuthor('Downloading from remote host', 'https://i.gifer.com/Epln.gif')
      .setColor(0x93688C)
      .addField(`Transferred: ${prettyBytes(progress.info.bytesOverall)} **~${prettyBytes(speed)}/s** *avg ${prettyBytes(avgspeed)}/s*`, `${fileSet}`)
      .setFooter(`${moment(new Date()).utc().format('dddd, MMMM Do YYYY, h:mm:ss A')} GMT | ${moment(startTime).fromNow(true)} elapsed`)

    message.edit('Backing up to Olympus right now...', embed)
      .then(msg => console.log(`Transferred: ${prettyBytes(progress.info.bytesOverall)} *~${prettyBytes(speed)}/s* *avg ${prettyBytes(avgspeed)}/s*`))
      .catch(e => {
        console.log(e)
        try {
          message.react('warning')
        } catch (e) {
          console.log(e)
        }
      })
  }
  progress.latestBytes = progress.info.bytesOverall
}

// INIT
let initiated = false
let message
backup()

async function backup () {
  // DISCORD BOT & PROGRESS
  client.login(config.bot.token)
  client.once('ready', async () => {
    if (!initiated) { // fearing this might fire twice would discord have issues
      let embed = await new Discord.RichEmbed()
        .setAuthor('Initializing progress', 'https://i.gifer.com/9u1B.gif')
        .setColor(0x93688C)
        .setTitle(`Starting...`)
        .setFooter(`${moment(new Date()).utc().format('dddd, MMMM Do YYYY, h:mm:ss A')} GMT`)

      message = await client.channels.find('id', config.bot.channel).send('Getting ready to backup up to Olympus...', embed)
      initiated = true
    }
  })

  // FTP CLIENT
  const remote = new ftp.Client()
  // remote.ftp.verbose = true
  try {
    // Log in
    await remote.access({
      host: config.host,
      user: config.user,

      password: config.pass,
      secure: config.secure
    })

    // Check stuff
    remote.remoteDirName = config.remote
    await remote.ensureDir(config.remote)

    // Set a new callback function which also resets the overall counter
    remote.trackProgress(info => {
      let fileList = progress.latestItems
      fileList[fileList.length] = info.name
      progress.info = info
      progress.latestItems = fileList
    })
    progress.starting = false
    await remote.downloadDir(config.local)

    // Stop logging
    remote.trackProgress() // eslint-disable-line
  } catch (err) {
    console.log(err)
    try {
      message.react('blamecao')
      message.react('radioactive')
    } catch (err) {
      return
    }
  }
  remote.close()
  clearInterval(handler)

  // UPDATE TO CONFIRM MESSAGE
  let stats = {size: 0, files: 0}
  try {
    // GET STATS
    const walkSync = function (dir, filelist) {
      let files = fs.readdirSync(dir)
      filelist = filelist || []
      files.forEach(function (file) {
        let fileStats = fs.statSync(dir + file)
        if (fileStats.isDirectory()) {
          filelist = walkSync(dir + file + '/', filelist)
        } else {
          filelist.push(file)
          stats.size += fileStats.size
        }
      })
      return filelist
    }
    stats.files = await walkSync(config.local)
  } catch (e) {
    console.log(e)
  }
  let embed = await new Discord.RichEmbed()
    .setAuthor('Transfer complete', 'https://media.giphy.com/media/3o6Zt8MgUuvSbkZYWc/giphy.gif')
    .setColor(0x7FFFAC)
    .setTitle(`Total size: ${prettyBytes(stats.size)} took ${moment(startTime).fromNow(true)}`)
    .setDescription(`${stats.files.length} files transferred sucessfully from remote host.`)
    .setFooter(`${moment(new Date()).utc().format('dddd, MMMM Do YYYY, h:mm:ss A')} GMT`)

  message.edit('Sucessfully backed up to Olympus.', embed)
  client.destroy()
}
