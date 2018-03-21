const AWS = require('aws-sdk')
const pack = require('./pack')

const lambda = new AWS.Lambda({ region: 'us-east-1' })

const createLambda = async ({
  name, handler, memory, timeout, env, description
}, role) => {
  const pkg = await pack()

  const params = {
    FunctionName: name,
    Code: {
      ZipFile: pkg
    },
    Description: description,
    Handler: handler,
    MemorySize: memory,
    Publish: true,
    Role: role.arn,
    Runtime: 'nodejs6.10',
    Timeout: timeout,
    Environment: {
      Variables: env
    }
  }

  const res = await lambda.createFunction(params).promise()
  return {
    arn: res.FunctionArn,
    roleArn: role.arn
  }
}

const updateLambda = async ({
  name, handler, memory, timeout, env, description
}, role) => {
  const pkg = await pack()
  const functionCodeParams = {
    FunctionName: name,
    ZipFile: pkg,
    Publish: true
  }

  const functionConfigParams = {
    FunctionName: name,
    Description: description,
    Handler: handler,
    MemorySize: memory,
    Role: role.arn,
    Runtime: 'nodejs6.10',
    Timeout: timeout,
    Environment: {
      Variables: env
    }
  }

  await lambda.updateFunctionCode(functionCodeParams).promise()
  const res = await lambda.updateFunctionConfiguration(functionConfigParams).promise()

  return {
    arn: res.FunctionArn,
    roleArn: role.arn
  }
}

const deleteLambda = async (name) => {
  const params = {
    FunctionName: name
  }

  await lambda.deleteFunction(params).promise()
  return {
    arn: null
  }
}

const deploy = async (inputs, context) => {
  let outputs = {}

  const configuredRole = inputs.role
  let { defaultRole } = context.state

  const defaultRoleComponent = context.load('aws-iam-role', 'defaultRole')

  if (!configuredRole && !defaultRole) {
    const iamInputs = {
      name: `${inputs.name}-execution-role`,
      service: 'lambda.amazonaws.com'
    }
    defaultRole = await defaultRoleComponent.deploy(iamInputs)
  }

  const role = configuredRole || defaultRole

  if (inputs.name && !context.state.name) {
    context.log(`Creating Lambda: ${inputs.name}`)
    outputs = await createLambda(inputs, role)
  } else if (context.state.name && !inputs.name) {
    context.log(`Removing Lambda: ${context.state.name}`)
    outputs = await deleteLambda(context.state.name)
  } else if (inputs.name !== context.state.name) {
    context.log(`Removing Lambda: ${context.state.name}`)
    await deleteLambda(context.state.name)
    context.log(`Creating Lambda: ${inputs.name}`)
    outputs = await createLambda(inputs, role)
  } else {
    context.log(`Updating Lambda: ${inputs.name}`)
    outputs = await updateLambda(inputs, role)
  }

  if (configuredRole && defaultRole) {
    await defaultRoleComponent.remove()
    defaultRole = null
  }

  context.saveState({ ...inputs, ...outputs, defaultRole })
  return outputs
}

const remove = async (inputs, context) => {
  if (context.state.defaultRole) {
    const defaultRoleComponent = context.load('aws-iam-role', 'defaultRole')
    await defaultRoleComponent.remove()
  }

  context.log(`Removing Lambda: ${context.state.name}`)
  const outputs = await deleteLambda(context.state.name)
  context.saveState()
  return outputs
}

module.exports = {
  deploy,
  remove
}