const Discord = require('discord.js')
const parser = require('discord-command-parser')
const msRest = require('@azure/ms-rest-js')
const msRestAzure = require('@azure/ms-rest-nodeauth')
const { ComputeManagementClient } = require('@azure/arm-compute');
const client = new Discord.Client()
const PREFIX = '/'

const secrets = JSON.parse(require('fs').readFileSync('./secrets.json'))

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
            const creds = await msRestAzure.loginWithServicePrincipalSecret(secrets.CLIENT_ID, secrets.CLIENT_SECRET, secrets.TENANT_ID)
            const computeClient = new ComputeManagementClient(creds, secrets.SUB_ID)
            if (parsed.command === 'stop') {
                message.reply('Powering off the VM (this may take a minute)...')
                await computeClient.virtualMachines.deallocate(secrets.VM_RESOURCE_GROUP_NAME, secrets.VM_NAME)
                message.reply('Successfully Powered off the VM.')
            }
            if (parsed.command === 'start') {
                message.reply('Powering on the VM (this may take a minute)...')
                await computeClient.virtualMachines.start(secrets.VM_RESOURCE_GROUP_NAME, secrets.VM_NAME)
                message.reply('Successfully Powered on the VM.')
            }
            const vm = await computeClient.virtualMachines.get(secrets.VM_RESOURCE_GROUP_NAME, secrets.VM_NAME, { expand: 'instanceView' })
            const status = vm.instanceView.statuses.find(s => s.code.includes('PowerState')).code
            message.reply(`VM is currently ${status.split('/')[1]}`)
        }
    }
})

client.login(secrets.DISCORD_SECRET)