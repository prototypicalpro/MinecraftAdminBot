const Discord = require('discord.js')
const parser = require('discord-command-parser')
const msRest = require('@azure/ms-rest-js')
const msRestAzure = require('@azure/ms-rest-nodeauth')
const { ComputeManagementClient } = require('@azure/arm-compute');
const Mutex = require('async-mutex').Mutex;
const client = new Discord.Client()
const oneThingMutex = new Mutex()
const PREFIX = '/'

require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '/home/discordbot/.env' : null })

/**
 * Get the status of our Azure VM.
 * 
 * @param {ComputeManagementClient} computeClient The client to query the VM with
 * @returns {Promise<string|undefined>} A string indicating the status, or undefined if none was found. Strings will be "deallocated" or "running".
 */
async function getServerStatus(computeClient) {
    // get the server status 
    const vm = await computeClient.virtualMachines.get(process.env.VM_RESOURCE_GROUP_NAME, process.env.VM_NAME, { expand: 'instanceView' })
    const statusobj = vm.instanceView.statuses.find(s => s.code.includes('PowerState'))
    return statusobj && statusobj.code.split('/')[1]
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`)
})

client.on('message', async message => {
    if (message.channel.type === 'text' && message.channel.name === 'admin-bot' && !message.author.bot) {
        const parsed = parser.parse(message, PREFIX)
        if (!parsed.success) return
        if (parsed.command === 'start' || parsed.command === 'stop' || parsed.command === 'status') {
            if (oneThingMutex.isLocked()) {
                await message.reply('I can only do one thing at a time.')
                return
            }
            // admin commands!
            await oneThingMutex.runExclusive(async () => {
                // authenticate to azure
                const creds = await msRestAzure.loginWithServicePrincipalSecret(process.env.CLIENT_ID, process.env.CLIENT_SECRET, process.env.TENANT_ID)
                const computeClient = new ComputeManagementClient(creds, process.env.SUB_ID)
                // get the server status 
                const status = await getServerStatus(computeClient)
                // stop and deprovision the server
                if (parsed.command === 'stop') {
                    if (status === 'deallocated')
                        return await message.reply('VM is already deallocated')
                    await message.reply('Powering off the VM (this may take a minute)...')
                    await computeClient.virtualMachines.deallocate(process.env.VM_RESOURCE_GROUP_NAME, process.env.VM_NAME)
                    await message.reply('Successfully Powered off the VM.')
                }
                // start the server
                if (parsed.command === 'start') {
                    if (status === 'running')
                        return await message.reply('VM is already running')
                    await message.reply('Powering on the VM (this may take a minute)...')
                    await computeClient.virtualMachines.start(process.env.VM_RESOURCE_GROUP_NAME, process.env.VM_NAME)
                    await message.reply('Successfully Powered on the VM. Minecraft will still need a few minutes to start.')
                }
                // send minecraft commands to the server
                // WARNING: this is potentially super unsafe! Do not add this bot to a server you do not trust
                if (parsed.command === 'command') {
                    if (status === 'deallocated')
                        return await message.reply('You need to start the server with /start before sending commands to it')
                    if (parsed.arguments.length === 0)
                        return await message.reply('You didn\'t specify a command')
                    const mcCommand = parsed.arguments.join(' ')
                    await message.reply(`Sending command \`${mcCommand}\` to server`)
                    const result = await computeClient.virtualMachines.runCommand(process.env.VM_RESOURCE_GROUP_NAME, process.env.VM_NAME, {
                        commandId: 'RunShellScript',
                        script: [`mark2 send ${mcCommand}`]
                    })
                    await message.reply(`Recieved response \`${result.value.find(r => r.code.includes('StdOut')).message}\``)
                }
                // print the status
                const afterstatus = await getServerStatus(computeClient)
                await message.reply(`VM is currently ${afterstatus}`)
            })
        }

    }
})

client.login(process.env.DISCORD_SECRET)