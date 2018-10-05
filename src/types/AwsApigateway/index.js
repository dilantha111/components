const { equals } = require('ramda')
const { pick } = require('@serverless/utils')
const { getSwaggerDefinition, generateUrl, generateUrls } = require('./utils')

const inputsProps = ['provider', 'name', 'roleArn', 'routes']

const deleteApi = async (APIGateway, params) => {
  const { id } = params

  await APIGateway.deleteRestApi({
    restApiId: id
  }).promise()
  const outputs = {
    id: null,
    url: null,
    urls: null
  }
  return outputs
}

const createApi = async (APIGateway, params) => {
  const { name, roleArn, routes } = params

  const swagger = getSwaggerDefinition(name, roleArn, routes)
  const json = JSON.stringify(swagger)

  const res = await APIGateway.importRestApi({
    body: Buffer.from(json, 'utf8')
  }).promise()

  await APIGateway.createDeployment({
    restApiId: res.id,
    stageName: 'dev'
  }).promise()

  const url = generateUrl(res.id)
  const urls = generateUrls(routes, res.id)

  const outputs = {
    id: res.id,
    url,
    urls
  }
  return outputs
}

const updateApi = async (APIGateway, params) => {
  const { name, roleArn, routes, id } = params

  const swagger = getSwaggerDefinition(name, roleArn, routes)
  const json = JSON.stringify(swagger)

  await APIGateway.putRestApi({
    restApiId: id,
    body: Buffer.from(json, 'utf8')
  }).promise()

  await APIGateway.createDeployment({
    restApiId: id,
    stageName: 'dev'
  }).promise()

  const url = generateUrl(id)
  const urls = generateUrls(routes, id)

  const outputs = {
    id,
    url,
    urls
  }
  return outputs
}

export default {
  async deploy(prevInstance, context) {
    const APIGateway = new this.provider.sdk.APIGateway({
      region: process.env.AWS_DEFAULT_REGION || 'us-east-1'
    })
    const inputs = pick(inputsProps, this)
    const noChanges =
      inputs.name === context.state.name &&
      inputs.roleArn === context.state.roleArn &&
      equals(inputs.routes, context.state.routes)

    let outputs
    if (noChanges) {
      outputs = context.state
    } else if (inputs.name && !context.state.name) {
      context.log(`Creating API Gateway: "${inputs.name}"`)
      outputs = await createApi(inputs)
    } else {
      context.log(`Updating API Gateway: "${inputs.name}"`)
      outputs = await updateApi(APIGateway, {
        ...inputs,
        id: context.state.id,
        url: context.state.url
      })
    }
    context.saveState({ ...inputs, ...outputs })
    return outputs
  },

  async remove(prevInstance, context) {
    const outputs = {
      id: null,
      url: null,
      urls: null
    }

    try {
      context.log(`Removing API Gateway: "${context.state.name}"`)
      await deleteApi({ name: context.state.name, id: context.state.id })
    } catch (e) {
      if (!e.message.includes('Invalid REST API identifier specified')) {
        throw e
      }
    }

    context.saveState()
    return outputs
  }
}
