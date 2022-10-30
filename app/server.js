import udp from 'dgram'
import express from 'express'

import { db, Config, Server, Gear, Member, Region, Energy } from './database.js'

import { magicGetFloatFromScale, magicGetIntAnyLength } from './magicValue.js'
import { exit } from 'process'
import bodyParser from 'body-parser'
import routeGenFn from './routeGen.js'
import pg from 'pg'
import sequelize from 'sequelize'
import moment from 'moment'
import path from 'path'
import fs from 'fs'

pg.defaults.parseInt8 = true // this let biging not show as string

const __dirname = path.resolve();
const app = express()
const httpPort = 8000

// app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

routeGenFn(app, 'server', Server)
routeGenFn(app, 'config', Config)
routeGenFn(app, 'gear', Gear)
routeGenFn(app, 'member', Member)
routeGenFn(app, 'region', Region)

const PRIMARY_FILE_PATH = path.join(__dirname, 'primary')

app.post('/api/primary', async ({ body: { id } }, res) => {
    try {
        if (!id) throw new Error('cannot get param id')
        fs.writeFileSync(PRIMARY_FILE_PATH, String(id))
        res.json({
            status: 'success'
        })
    } catch (e) {
        res.json({
            status: 'error',
            message: e.message,
        })
    }
})

app.get('/api/primary', async (req, res) => {
    try {
        let p = fs.readFileSync(PRIMARY_FILE_PATH)
        let pid = parseInt(p.toString())
        res.json({
            id: pid,
        })
    } catch (e) {
        res.json({
            message: e.message,
        })
    }
})

app.get('/api/energy-raw', async ({ query }, res) => {
    try {
        let found = await Energy.findAll({
            where: query,
            limit: 1000,
        })
        res.json(found)
    } catch (e) {
        res.json({
            message: e.message,
        })
    }
})


app.get('/api/energy', async ({ query }, res) => {
    try {
        let found = await Energy.findAll({
            where: query,
            limit: 1000,
        })
        let first = found.length ? found[0].toJSON : {}
        res.json({
            keys: Object.keys(first),
            values: found.map(data => Object.values(data.toJSON())),
        })
    } catch (e) {
        res.json({
            message: e. message,
        })
    }
})

app.get('/api/region-gear', async ({ query }, res) => {
    try {
        let regions = await Region.findAll({
            where: query,
            include: [Gear],
        })
        res.json(regions)
    } catch (e) {
        res.json({
            message: e.message
        })
    }
})

// import tmp from './tmp.json'

app.get('/api/history', async ({ query: { config_id, step } }, res) => {
    try {
        // res.json(tmp)
        res.json(await fetchEnergyData(config_id, step))
    } catch (e) {
        res.json({
            message: e.message
        })
    }
})

app.get('/api/analysis', async ({ query: { config_id, start_at, end_at }}, res) => {
    try {
        start_at = parseInt(start_at)
        end_at = parseInt(end_at)
        res.json(await getGroupingData(config_id, start_at, end_at))
    } catch (e) {
        res.json({
            message: e.message
        })
    }
})

app.get('/api/errors/light-max-2-month',  async ({ query: { id: gear_id }}, res) => {
    try {
        res.json(await getErrorMaxLightSearch2Month(gear_id))
    } catch (e) {
        res.json({
            message: e.message
        })
    }
})

app.get('/api/errors/light-search', async ({ query: { id: gear_id, start_at, end_at }}, res) => {
    try {
        start_at = parseInt(start_at)
        end_at = parseInt(end_at)
        res.json(await getErrorLightSearch(gear_id, start_at, end_at))
    } catch (e) {
        res.json({
            message: e.message
        })
    }
})

app.get('/api/errors/point-data', async ({ query: { id: gear_id, created_at }}, res) => {
    try {
        created_at = parseInt(created_at)
        res.json(await getErrorPointData(gear_id, created_at))
    } catch (e) {
        res.json({
            message: e.message
        })
    }
})

app.get('/api/region-status', async ({ query: { config_id }}, res) => {
    try {
        res.json(await fetchStatus(config_id))
    } catch (e) {
        res.json({
            message: e.message
        })
    }
})

app.use(express.static(path.join(__dirname, 'dist')))


function listenUDP () {
    const server = udp.createSocket('udp4')

    server.on('close', c => console.log('Socket is closed !'))

    server.on('error', error => {
        console.log('Error: ', error)
        server.close();
    })

    server.on('message', async (msgByte, { address }) => {
        const MIN_SIZE = 140
        console.log(`${Date()} Received ${msgByte.length} bytes from ${address}`)
        if (msgByte.length < MIN_SIZE) return
        let header = msgByte.slice(0,6).toString()
        if (header !== 'DALI-2') {
            console.log(`header ${header} isnt DALI-2, please check`)
            return
        }

        let data = {
            tSerial: msgByte.hexSlice(6, 14),
            mac_address: msgByte.readBigUInt64BE(14),
            channel: msgByte.readUInt8(22),
            unit_id: msgByte.readUInt8(23),
            device_status: msgByte.readUInt8(26),
            device_arc: msgByte.readUInt8(27),
            
            active_energy: magicGetFloatFromScale(msgByte, 41, 47),
            active_power: magicGetFloatFromScale(msgByte, 48, 52),
            
            apparent_energy: magicGetFloatFromScale(msgByte, 54, 60),
            apparent_power: magicGetFloatFromScale(msgByte, 61, 65),
            
            loadside_energy: magicGetFloatFromScale(msgByte, 67, 73),
            loadside_power: magicGetFloatFromScale(msgByte, 74, 78),
            
            control_gear_on_time: msgByte.readUInt32BE(80),
            control_gear_start_count: msgByte.readUInt32BE(83) & 0x00ffffff,
            // from 84 ~ 86 using 83 AND 0x00

            control_gear_voltage: magicGetIntAnyLength(msgByte, 87, 88),
            control_gear_voltage_frequence: msgByte.readUInt8(89),
            control_gear_power_factor: msgByte.readUInt8(90),
            control_gear_failure: msgByte.readUInt8(91),
            control_gear_failure_count: msgByte.readUInt8(92),

            control_gear_under_voltage: msgByte.readUInt8(93),
            control_gear_under_voltage_count: msgByte.readUInt8(94),
            control_gear_over_voltage: msgByte.readUInt8(95),
            control_gear_over_voltage_count: msgByte.readUInt8(96),
            control_gear_output_power_limit: msgByte.readUInt8(97),
            control_gear_output_power_limit_count: msgByte.readUInt8(98),
            control_gear_thermal_deration: msgByte.readUInt8(99),
            control_gear_thermal_deration_count: msgByte.readUInt8(100),
            control_gear_thermal_shutdown: msgByte.readUInt8(101),
            control_gear_thermal_shutdown_count: msgByte.readUInt8(102),
            control_gear_temperature: msgByte.readUInt8(103),
            control_gear_output_current_percent: msgByte.readUInt8(104),
            light_source_start_count_resettable: magicGetIntAnyLength(msgByte, 106, 108),
            light_source_start_count: magicGetIntAnyLength(msgByte, 109, 111),
            light_source_on_time_count_resettable: msgByte.readUInt32BE(112),
            light_source_on_time: msgByte.readUInt32BE(116),
            light_source_voltage: magicGetIntAnyLength(msgByte, 120, 121),
            light_source_current: magicGetIntAnyLength(msgByte, 122, 123),
            light_source_failure: msgByte.readUInt8(124),
            light_source_faiture_count: msgByte.readUInt8(125),
            light_source_short: msgByte.readUInt8(126),
            light_source_short_count: msgByte.readUInt8(127),
            light_source_open: msgByte.readUInt8(128),
            light_source_open_count: msgByte.readUInt8(129),
            light_source_thermal_derating: msgByte.readUInt8(130),
            light_source_thermal_derating_count: msgByte.readUInt8(131),
            light_source_thermal_shutdown: msgByte.readUInt8(132),
            light_source_thermal_shutdown_count: msgByte.readUInt8(133),
            light_source_temperature: msgByte.readUInt8(134),
        }


        // do some adjustment
        data.control_gear_voltage /= 10
        data.light_source_voltage /= 10
        data.light_source_current /= 1000

        data.control_gear_temperature -= 60
        data.light_source_temperature -= 60
        data.control_gear_power_factor /= 100

        let gearServerID = Number(data.mac_address)
        
        let tarGear = await Gear.findOne({
            where: {
                server_id: gearServerID,
                channel_id: data.channel,
                unit_id: data.unit_id,
            }
        })
        console.log(data)
        if (!tarGear) {
            console.log(`cannot find target Gear`)
            return
        }

        const dataSaving = {
            ...data,
            gear_id: tarGear.id,
        }
        await Energy.create(dataSaving)

    })

    server.on('listening', s => {
        const { port, family, ipaddr } = server.address();
        console.log(`Server is listening at port ${port}`)
        console.log('Server ip :' + ipaddr)
        console.log('Server is IP4/IP6 : ' + family)
    })

    server.bind(6666);
    
}


async function listenHTTP () {
    try {
       app.listen(httpPort, nil => console.log('listen HTTP on port', httpPort))
    } catch (e) {
        console.log(e)
    }
}

const param = process.argv[2]

async function main () {
    if (param === 'sync') {
        console.log(`now do DB sync`)
        await db.authenticate()
        await db.sync({ force: true })
        exit()
    } else if (param === 'gear') {
        for (let chan of [0, 1, 2, 3]) {
            for (let unit_id of Array(64).keys()) {
                await Gear.create({
                    sequence: 0,
                    name: `nonamed-${chan}-${unit_id}`,
                    artilect_type: "ARTILECT",
                    dali_type: "DALI",
                    type_model: 0,
                    channel_id: chan,
                    unit_id,
                    display_name: `display-${chan}-${unit_id}`,
                })
            }
        }
    } else {
        listenUDP()
        listenHTTP()
    }
}

async function test () {

    let start = new Date('2020/10/01').getTime()
    let end = new Date().getTime()

    let ed = new Date('2020/12/01').getTime()
    // let r = await getGroupingData(15, start, end)
    // console.log(r.week[188])
    // for (let i = 169; i < 196; i++) {
    //     let e = await getErrorData(i, start, end)
    //     console.log(i, e)
    // }

    // let e = await getErrorLightSearch(174, start, end)
    // console.log(174, e)

    // let d = await getErrorPointData(174, ed)
    // console.log(d)
    // console.log(await fetchStatus(15))
    // let test = await getGroupingData(15,1614077991599,1616583591600)
    // console.log(test.week)
    // console.log(await fetchEnergyData(2, 'minute'))
    // let dd = await getErrorMaxLightSearch(15)
    let dd = await getErrorMaxLightSearch2Month(15)
    console.log(dd)
}

if (process.argv[2] === 'test') test()
else main()

async function getGearIDs (config_id) {
    let servers = await Server.findAll({
        where: { config_id },
        raw: true,
    })
    let sids = servers.map(s => s.id)
    let gears = await Gear.findAll({
        where: {
            "server_id": {
                [sequelize.Op.in]: sids,
            }
        },
        order: ['id'],
        raw: true,
        attributes: ['id'],
    })
    return gears.map(g => g.id)
}

function mergeToDailyData (sameGearDatas) {
    if (sameGearDatas.length < 2) return sameGearDatas
    // this avoid [0] fetching errors
    sameGearDatas = sameGearDatas.sort((d1, d2) => d2.created_at - d1.created_at)
    let currentData = sameGearDatas[0]
    let currentMoment = moment(currentData.created_at)
    let returnDailyData = [currentData]
    let arc = currentData.device_arc
    let arcnt = 1
    for (let data of sameGearDatas) {
        if (currentMoment.isSame(moment(data.created_at), 'day')) {
            arc += data.device_arc
            arcnt++
            continue
        }
        currentData.device_arc = arc / arcnt
        arc = data.device_arc
        arcnt = 1

        currentData = data
        currentMoment = moment(data.created_at).hours(0)
        returnDailyData.push(data)
    }
    currentData.device_arc = arc / arcnt
    returnDailyData = returnDailyData.sort((d1, d2) => d1.created_at - d2.created_at)
    return returnDailyData
}


function mergeToHourData (sameGearDatas) {
    if (sameGearDatas.length < 2) return sameGearDatas
    // this avoid [0] fetching errors
    sameGearDatas = sameGearDatas.sort((d1, d2) => d1.created_at - d2.created_at)
    let currentData = sameGearDatas[0]
    let currentMoment = moment(currentData.created_at)
    let returnDailyData = [currentData]
    for (let data of sameGearDatas) {
        if (currentMoment.isSame(moment(data.created_at), 'hour')) continue
        currentData = data
        currentMoment = moment(data.created_at).minutes(0)
        returnDailyData.push(data)
    }
    return returnDailyData
}

function caculateOntimeRate (currentData, previousData, on_time_key) {
	const startM = moment(previousData.created_at)
	const endM = moment(currentData.created_at)

	const duration = moment.duration(endM.diff(startM))
	const diffSecond = duration.asSeconds()
	return Math.min(100, 100 * (currentData[on_time_key] - previousData[on_time_key]) / diffSecond)
}

function groupWeekData (sameGearDatas) {
    let dailyData = mergeToDailyData(sameGearDatas)
    let returnGroup = {}
    let ontimeCounters = {}
    for (let weekDay of Array(7).keys()) {
        returnGroup[weekDay] = {
            active_energy: 0,
            apparent_energy: 0,
            loadside_energy: 0,

            light_source_on_time: 0,
            light_source_start_count: 0,
            control_gear_voltage: 0,
            control_gear_voltage_frequence: 0,

            device_arc: 0,
        }
        ontimeCounters[weekDay] = 0
    }
    dailyData.forEach((dData, hIndex) => {
        const nextDayData = dailyData[hIndex + 1]
        if (!nextDayData) return
        // skip last one
        let { created_at } = dData
        let weekOfDay = moment(created_at).weekday()
        returnGroup[weekOfDay].active_energy += nextDayData.active_energy - dData.active_energy
        returnGroup[weekOfDay].apparent_energy += nextDayData.apparent_energy - dData.apparent_energy
        returnGroup[weekOfDay].loadside_energy += nextDayData.loadside_energy - dData.loadside_energy
        
        returnGroup[weekOfDay].light_source_start_count += nextDayData.light_source_start_count - dData.light_source_start_count
        returnGroup[weekOfDay].light_source_on_time += caculateOntimeRate(nextDayData, dData, 'light_source_on_time')
        returnGroup[weekOfDay].control_gear_voltage = dData.control_gear_voltage
        returnGroup[weekOfDay].control_gear_voltage_frequence = dData.control_gear_voltage_frequence
        returnGroup[weekOfDay].device_arc += nextDayData.device_arc

        ontimeCounters[weekOfDay]++
    })
    for (let weekDay of Array(7).keys()) {
        if (ontimeCounters[weekDay]) {
            // avoid devide 0
            returnGroup[weekDay].light_source_start_count /= ontimeCounters[weekDay]
            returnGroup[weekDay].device_arc /= ontimeCounters[weekDay]
        }
    }

    return returnGroup
}

function groupHourData (sameGearDatas) {
    if (sameGearDatas.length <= 24) return undefined
    // force return 24
    // this avoid [0] fetching errors
    sameGearDatas = sameGearDatas.sort((d1, d2) => d1.created_at - d2.created_at)
    let currentData = sameGearDatas[0]
    let currentMoment = moment(currentData.created_at)
    let hourlyData = [currentData]
    let returnGroup = {}
    let ontimeCounters = {}
    for (let data of sameGearDatas) {
        if (currentMoment.isSame(moment(data.created_at), 'hour')) continue
        currentData = data
        currentMoment = moment(data.created_at).minute(0)
        hourlyData.push(data)
    }
    for (let beginHour of Array(24).keys()) {
        returnGroup[beginHour] = {
            active_energy: 0,
            apparent_energy: 0,
            loadside_energy: 0,

            light_source_on_time: 0,
            light_source_start_count: 0,

            device_arc: 0,
        }
        ontimeCounters[beginHour] = 0
    }

    hourlyData.forEach((hData, hIndex) => {
        const nextHourData = hourlyData[hIndex + 1]
        if (!nextHourData) return
        // skip last one
        let { created_at } = hData
        let groupHour = moment(created_at).hour()
        returnGroup[groupHour].active_energy += nextHourData.active_energy - hData.active_energy
        returnGroup[groupHour].apparent_energy += nextHourData.apparent_energy - hData.apparent_energy
        returnGroup[groupHour].loadside_energy += nextHourData.loadside_energy - hData.loadside_energy
        
        returnGroup[groupHour].light_source_start_count += nextHourData.light_source_start_count - hData.light_source_start_count
        returnGroup[groupHour].light_source_on_time += caculateOntimeRate(nextHourData, hData, 'light_source_on_time')

        returnGroup[groupHour].device_arc = hData.device_arc
        returnGroup[groupHour].control_gear_voltage = hData.control_gear_voltage
        returnGroup[groupHour].control_gear_voltage_frequence = hData.control_gear_voltage_frequence

        ontimeCounters[groupHour] ++
    })

    for (let beginHour of Array(24).keys()) {
        if (ontimeCounters[beginHour]) {
            // avoid devide 0
            returnGroup[beginHour].light_source_on_time /= ontimeCounters[beginHour]
            returnGroup[beginHour].device_arc /= ontimeCounters[beginHour]
        }
    }
    return returnGroup
}

async function fetchEnergyData (config_id, step) {
    if (!['hour', 'minute'].includes(step)) {
        throw new Error('step must be day or minute')
    }

    let gids = await getGearIDs(config_id)
    let today = moment()

    let resultData = {}
    const queryCondition = step === 'minute'
        ? today.clone().subtract(3, 'hour').toDate()
        : today.clone().subtract(1, 'day').toDate()
    let energys = await Energy.findAll({
        where: {
            gear_id: {
                [sequelize.Op.in]: gids,
            },
            created_at: {
                [sequelize.Op.gt]: queryCondition
            },
            // control_gear_on_time: {
                // [sequelize.Op.gt]: 0, // is a filter for empty data
            // },
        },
        order: [
            ['gear_id'],
            ['created_at', 'DESC'],
        ],
        raw: true,
    })
    for (let gid of gids) {
        let gidSpecifices = energys.filter(d => d.gear_id === gid)
        if (step === 'hour') {
            // day mode, dedide datas to be hourly data
            resultData[gid] = []
            let currentPointer = 0
            for (let spf of gidSpecifices) {
                let currentData = resultData[gid][currentPointer]
                if (!currentData) {
                    // tar is empty, push it it
                    resultData[gid].push(spf)
                    continue
                }
                if (moment(currentData.created_at).isSame(moment(spf.created_at), 'hour')) {
                    resultData[gid][currentPointer] = spf
                    continue
                }
                currentPointer ++
            }
        } else {
            resultData[gid] = gidSpecifices
        }
    }
    return resultData
}

async function getGroupingData (config_id, startAt, endAt) {
    let gids = await getGearIDs(config_id)
    let datas = await Energy.findAll({
        where: {
            gear_id: {
                [sequelize.Op.in]: gids,
            },
            created_at: {
                [sequelize.Op.gt]: startAt,
                [sequelize.Op.lt]: endAt,
            },
            // control_gear_on_time: {
            //     [sequelize.Op.gt]: 0, // is a filter for empty data
            // },
        },
        order: [
            ['gear_id'],
            ['created_at', 'DESC'], // DEST => newer first
        ],
        attributes: [
            'id',
            'gear_id',
            'created_at',

            'active_energy',
            'apparent_energy',
            'loadside_energy',
            
            'light_source_on_time',
            'light_source_start_count',
            'device_arc',

            'control_gear_voltage',
            'control_gear_voltage_frequence',
            'control_gear_power_factor',
        ],
        raw: true
    })
    let analysis = {
        day: {},
        hour: {},
        week: {},
    }

    for (let gid of gids) {
        let gidSpecifices = datas.filter(d => d.gear_id === gid)
        analysis.day[gid] = mergeToDailyData(gidSpecifices)
        analysis.hour[gid] = groupHourData(gidSpecifices)
        analysis.week[gid] = groupWeekData(gidSpecifices)
    }
    return analysis
}

async function getErrorLightSearch (gear_id, startAt, endAt) {
    const endM = moment(endAt)
    const startM = moment(startAt)
    
    const errorKeys = [
        'light_source_faiture_count',
        'light_source_open_count',
        'light_source_short_count',
        'light_source_thermal_shutdown_count',
        'light_source_thermal_derating_count',
    ]
    let datas = await Energy.findAll({
        where: {
            gear_id,
            created_at: {
                [sequelize.Op.gt]: startAt,
                [sequelize.Op.lt]: endAt,
            },
            // control_gear_on_time: {
            //     [sequelize.Op.gt]: 0, // is a filter for empty data
            // },
        },
        order: [
            ['gear_id'],
            ['created_at'], // DESC => older first
        ],
        attributes: [
            // 'id',
            'gear_id',
            'created_at',
            ...errorKeys,
        ],
        raw: true,
    })
    let points = []

    datas.forEach((current, index) => {
        let next = datas[index + 1]
        if (!next) return
        for (let ek of errorKeys) {
            if (next[ek] > current[ek]) points.push(next)
        }
    })
    return points
}

async function getErrorPointData (gear_id, created_at) {

    const checkPointMoment = moment(created_at)
    const startAt = checkPointMoment.clone().subtract(1, 'day').toDate()
    const endAt = checkPointMoment.clone().add(1, 'day').toDate()

    const errorKeys = [
        'light_source_faiture_count',
        'light_source_open_count',
        'light_source_short_count',
        'light_source_thermal_shutdown_count',
        'light_source_thermal_derating_count',
    ]
    
    let datas = await Energy.findAll({
        where: {
            gear_id,
            created_at: {
                [sequelize.Op.gt]: startAt,
                [sequelize.Op.lt]: endAt,
            },
            // control_gear_on_time: {
            //     [sequelize.Op.gt]: 0, // is a filter for empty data
            // },
        },
        order: [
            ['gear_id'],
            ['created_at', 'DESC'], // DESC => older first
        ],
        attributes: [
            // 'id',
            'gear_id',
            'created_at',

            // 'light_source_faiture_count',
            // 'light_source_open_count',
            // 'light_source_short_count',
            // 'light_source_thermal_shutdown_count',
            // 'light_source_thermal_derating_count',
            ...errorKeys,

            'device_arc',
            'light_source_voltage',
            'light_source_current',
            'light_source_on_time',
            'light_source_temperature',
            'light_source_start_count',
            'light_source_on_time',
        ],
        raw: true
    })

    return datas
}

async function getErrorMaxLightSearch2Month (config_id) {
    const now = moment()
    const startAt = now.clone().subtract(2, 'month').toDate()
    const endAt = now.clone()
    const endM = moment(endAt)
    const startM = moment(startAt)
    let gids = await getGearIDs(config_id)
    // const conditions = [
    //     'max(light_source_faiture_count)',
    //     'max(control_gear_failure_count)',
    // ]
    let datas = []

    for (let gear_id of gids) {

        let data = await Energy.findOne({
            where: {
                gear_id,
                created_at: {
                    [sequelize.Op.gt]: startM,
                    [sequelize.Op.lt]: endM,
                },
            },
            group: [
                'gear_id',
                'id',
            ],
            // order: [
            //     'gear_id',
            //     'created_at', // DESC => older first
            // ],
            order: [
                sequelize.fn('max', sequelize.col('light_source_faiture_count')),
                sequelize.fn('max', sequelize.col('control_gear_failure_count')),
            ],
            attributes: [
                'gear_id',
                'light_source_faiture_count',
                'control_gear_failure_count',
            ],
            // attributes: [
            //     'gear_id',
            //     // ...errorKeys,
            // ],
            raw: true,
        })
        datas.push(data)
    }
   
    return datas.filter(d => {
        return !(d.light_source_faiture_count === 0 && d.control_gear_failure_count === 0)
    })
}



async function findLast60StatusError(config_id) {
    let gids = await getGearIDs(config_id)
    const startAt = checkPointMoment.clone().subtract(2, 'month').toDate()
    const endAt = checkPointMoment.clone()
    let datas = await Energy.findAll({
        where: {
            gear_id: {
                [sequelize.Op.in]: gids,
            },
            created_at: {
                [sequelize.Op.gt]: startAt,
                [sequelize.Op.lt]: endAt,
            },
            // control_gear_on_time: {
            //     [sequelize.Op.gt]: 0, // is a filter for empty data
            // },
        },
        order: []
    })
}

async function fetchStatus (config_id) {

    let gids = await getGearIDs(config_id)
    const now = new Date()
    const todayMoment = moment().hours(0).minute(0).seconds(0)
    const duration = moment.duration(moment().diff(todayMoment))
	const diffSecond = duration.asSeconds()

    let statusList = await Energy.findAll({
        where: {
            gear_id: {
                [sequelize.Op.in]: gids,
            },
            created_at: {
                // [sequelize.Op.lt]: new Date(now),
                [sequelize.Op.gt]: todayMoment,
            },
            // control_gear_on_time: {
            //     [sequelize.Op.gt]: 0, // is a filter for empty data
            // },
        },
        limit: 1000,
        order: [
            ['gear_id'],
            ['created_at', 'DESC'], // DEST => newer first
        ],
        __attributes: [
            'id',
            'gear_id',
            'created_at',
            'device_status',
            'device_arc',
            'active_power',
            'loadside_power',
            'light_source_on_time',
            'light_source_start_count',
            'control_gear_voltage',
            'light_source_voltage',
            'control_gear_power_factor',
            'control_gear_voltage',
            'control_gear_voltage_frequence',
            'light_source_voltage',
            'apparent_energy',
        ],
        // 2021-02-02 shows all
        // include: [Region],
        raw: true
    })

    let groupingData = {}
    for (let gid of gids) {
        groupingData[gid] = statusList.filter(s => s.gear_id === gid)
        let thisGidDataLength = groupingData[gid].length
        if (thisGidDataLength < 3) continue
        groupingData[gid] = [groupingData[gid][0], groupingData[gid][thisGidDataLength - 1]]

    }
    
    let uniqueStatus = {}
    for (let gear_id in groupingData) {
        let lastOne = groupingData[gear_id][0]
        let dayFirstOne = groupingData[gear_id][1] || groupingData[gear_id][0]
        if (!lastOne) continue
        uniqueStatus[gear_id] = {
            ...lastOne,
            isDC: lastOne.control_gear_voltage_frequence === 0,
            onTimeRate: (lastOne.light_source_on_time - dayFirstOne.light_source_on_time) / diffSecond,
            startCount: lastOne.light_source_start_count - dayFirstOne.light_source_start_count,
            energyUsage: lastOne.apparent_energy - dayFirstOne.apparent_energy,
        }
    }
    return uniqueStatus
}

