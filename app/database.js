import Sequelize from 'sequelize'
const { DataTypes: {
    INTEGER: INT,
    FLOAT,
    STRING,
    BIGINT,
}, Model } = Sequelize

let dbHostIp = '127.0.0.1'

if (process.env.host) {
    dbHostIp = process.env.host
    console.log('host DB IP: ', dbHostIp)
}

const { USER, PASSWORD } = process.env
if (!USER || !PASSWORD) {
    throw Error('start app with USER=ooo PASSWORD=xxx')
}

export const db = new Sequelize('energy', USER, PASSWORD, {
    host: dbHostIp,
    dialect: 'postgres',
    logging: false,
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    define: {
        timestamps: false,
        underscored: true,
    },
})

function initConfig (modelName) {
    return {
        modelName,
        sequelize: db,
        underscored: true,
        freezeTableName: true,
    }
}

export class Config extends Model {}
Config.init({
    name: STRING,
    no: INT,
    // timezone: INT,
}, initConfig('config'))

export class Server extends Model {}
Server.init({
    id: {
        type: BIGINT,
        primaryKey: true,
    },
    sequence: INT,
    instance: STRING,
    host: STRING,
    config_id: {
        type: INT,
        allowNull: false,
    },
}, initConfig('server'))

export class Region extends Model {}
Region.init({
    name: STRING,
    type: STRING,
    config_id: {
        type: INT,
        allowNull: false,
    },
}, initConfig('region'))

export class Gear extends Model {}
Gear.init({
    // sequence: INT,
    name: STRING,
    artilect_type: STRING,
    dali_type: STRING,
    type_model: STRING,
    channel_id: INT,
    unit_id: INT,
    power_in: INT,
    power_out: INT,
    life_hour: INT,
    ref_temp: INT,
    power_maxin: INT,
    lumen_out: INT,
    display_name: STRING,
    server_id: {
        type: BIGINT,
        allowNull: false,
    },
}, initConfig('gear'))


export class Member extends Model {}
Member.init({
    // region_id: {
    //     type: INT,
    //     allowNull: false,
    //     primaryKey: true,
    // },
    // gear_id: {
    //     type: INT,
    //     allowNull: false,
    //     primaryKey: true,
    // },
}, initConfig('member'))


export class Energy extends Model {}
Energy.init({
    // data_flag: INT,
    device_status: INT,
    device_arc: INT,
    active_energy: FLOAT,
    active_power: FLOAT,
    apparent_energy: FLOAT,
    apparent_power: FLOAT,
    loadside_energy: FLOAT,
    loadside_power: FLOAT,
    control_gear_on_time: INT,
    control_gear_start_count: INT,
    control_gear_voltage: FLOAT,
    control_gear_voltage_frequence: INT,
    control_gear_power_factor: FLOAT,
    control_gear_failure: INT,
    control_gear_failure_count: INT,
    control_gear_under_voltage: INT,
    control_gear_under_voltage_count: INT,
    control_gear_over_voltage: INT,
    control_gear_over_voltage_count: INT,
    control_gear_output_power_limit: INT,
    control_gear_output_power_limit_count: INT,
    control_gear_thermal_deration: INT,
    control_gear_thermal_deration_count: INT,
    control_gear_thermal_shutdown: INT,
    control_gear_thermal_shutdown_count: INT,
    control_gear_temperature: INT,
    control_gear_output_current_percent: INT,
    light_source_start_count_resettable: INT,
    light_source_start_count: INT,
    light_source_on_time_count_resettable: INT,
    light_source_on_time: INT,
    light_source_voltage: FLOAT,
    light_source_current: FLOAT,
    light_source_failure: INT,
    light_source_faiture_count: INT,
    light_source_short: INT,
    light_source_short_count: INT,
    light_source_open: INT,
    light_source_open_count: INT,
    light_source_short: INT,
    light_source_short_count: INT,
    light_source_thermal_derating: INT,
    light_source_thermal_derating_count: INT,
    light_source_thermal_shutdown: INT,
    light_source_thermal_shutdown_count: INT,
    light_source_temperature: INT,
}, {
    ...initConfig('energy'),
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
        {
            fields: ['created_at'],
        }
    ],
})

Server.belongsTo(Config, {
    foreignKey: 'config_id',
})
// Config.hasMany(Server)

Region.belongsTo(Config, {
    foreignKey: 'config_id',
})

Gear.belongsTo(Server,  {
    foreignKey: 'server_id',
})
// Server.hasMany(Gear)

// Gear.belongsToMany(Region, {through: Member, foreignKey: 'gear_id', otherKey: 'region_id'})
Region.belongsToMany(Gear, {through: Member, foreignKey: 'region_id', otherKey: 'gear_id'})

Energy.belongsTo(Gear, {
    foreignKey: 'gear_id',
})