import { Server } from './database.js'

export default function (app) {
    
    app.get('/server', async (req, res) => {
        res.json(await Server.findAll())
    })


    app.post('/server', async (req, res) => {
        try {
            await Server.create(req.body)
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

    app.put('/server/:id', async (req, res) => {
        try {
            await Server.update(req.body, {
                where: {
                    id: req.params.id,
                }
            })
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

    app.delete('/server/:id', async (req, res) => {
        try {
            await Server.destroy({
                where: {
                    id: req.params.id,
                }
            })
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

