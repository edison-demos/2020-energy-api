import sequelize from 'sequelize'

export default function (app, tableName, tableRef, includes) {
    
    app.get(`/api/${tableName}`, async ({ query }, res) => {
        try {
            let found = await tableRef.findAll({
                where: query,
                include: includes,
            })
            res.json(found)
        } catch (e) {
            res.json({})
        }
    })


    app.post(`/api/${tableName}`, async (req, res) => {
        try {
            await tableRef.create(req.body)
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

    app.put(`/api/${tableName}/:id`, async (req, res) => {
        try {
            let [ updatedCount ] = await tableRef.update(req.body, {
                where: {
                    id: req.params.id,
                }
            })
            if (updatedCount === 0) {
                throw new Error('cannot find this id')
            }
            res.json({
                status: 'success',
            })
        } catch (e) {
            res.json({
                status: 'error',
                message: e.message,
            })
        }
    })

    app.delete(`/api/${tableName}/:id`, async (req, res) => {
        const id = req.params.id
        try {
            let deleteCondition = {
                where: {
                    id: req.params.id,
                }
            }
            if (id === 'all') deleteCondition = {
                where: {
                    id: {
                        [sequelize.Op.gt]: 0,   
                    }
                }
            }
            await tableRef.destroy(deleteCondition)
            res.json({
                status: 'success',
            })
        } catch (e) {
            res.json({
                status: 'error',
                message: e.message,
            })
        }
    })
}

