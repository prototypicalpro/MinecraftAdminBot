const Discord = require('discord.js')
const parser = require('discord-command-parser')
const msRest = require('@azure/ms-rest-js')
const msRestAzure = require('@azure/ms-rest-nodeauth')
const { ComputeManagementClient } = require('@azure/arm-compute');
const client = new Discord.Client()
const PREFIX = '/'

require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '~/.env' : null })

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`)
})

client.on('message', async message => {
    if (message.channel.type === 'text' && message.channel.name === 'admin-bot') {
        const parsed = parser.parse(message, PREFIX)
        if (!parsed.success) return

        // admin commands!
        if (parsed.command === 'start' || parsed.command === 'stop' || parsed.command === 'status') {
            // authenticate to azure
            const creds = await msRestAzure.loginWithServicePrincipalSecret(process.env.CLIENT_ID, process.env.CLIENT_SECRET, process.env.TENANT_ID)
            const computeClient = new ComputeManagementClient(creds, process.env.SUB_ID)
            if (parsed.command === 'stop') {
                message.reply('Powering off the VM (this may take a minute)...')
                await computeClient.virtualMachines.deallocate(process.env.VM_RESOURCE_GROUP_NAME, process.env.VM_NAME)
                message.reply('Successfully Powered off the VM.')
            }
            if (parsed.command === 'start') {
                message.reply('Powering on the VM (this may take a minute)...')
                await computeClient.virtualMachines.start(process.env.VM_RESOURCE_GROUP_NAME, process.env.VM_NAME)
                message.reply('Successfully Powered on the VM.')
            }
            const vm = await computeClient.virtualMachines.get(process.env.VM_RESOURCE_GROUP_NAME, process.env.VM_NAME, { expand: 'instanceView' })
            const status = vm.instanceView.statuses.find(s => s.code.includes('PowerState')).code
            message.reply(`VM is currently ${status.split('/')[1]}`)
        }
    }
})

client.login(process.env.DISCORD_SECRET)