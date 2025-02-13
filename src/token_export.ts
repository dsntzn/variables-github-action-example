import { GetLocalVariablesResponse, LocalVariable } from '@figma/rest-api-spec'
import { rgbToHex } from './color.js'
import { Token, TokensFile } from './token_types.js'

function tokenTypeFromVariable(variable: LocalVariable) {
  // @ts-ignore-next-line
  if (variable.scopes.includes('FONT_FAMILY')) {
    return 'fontFamily'
  }
  // @ts-ignore-next-line
  if (variable.scopes.includes('FONT_STYLE')) {
    return 'fontStyle'
  }
  if (variable.scopes.includes('WIDTH_HEIGHT') || variable.scopes.includes('GAP')) {
    return 'dimension'
  }

  switch (variable.resolvedType) {
    case 'BOOLEAN':
      return 'boolean'
    case 'COLOR':
      return 'color'
    case 'FLOAT':
      return 'number'
    case 'STRING':
      return 'string'
  }
}

function tokenValueFromVariable(
  variable: LocalVariable,
  modeId: string,
  localVariables: { [id: string]: LocalVariable },
) {
  const value = variable.valuesByMode[modeId]
  if (typeof value === 'object') {
    if ('type' in value && value.type === 'VARIABLE_ALIAS') {
      const aliasedVariable = localVariables[value.id]
      return `{${aliasedVariable.name.replace(/\//g, '.')}}`
    } else if ('r' in value) {
      return rgbToHex(value)
    }

    throw new Error(`Format of variable value is invalid: ${value}`)
  } else {
    return value
  }
}

function tokenUnitFromVariable(variable: LocalVariable) {
  if (variable.scopes.includes('WIDTH_HEIGHT') || variable.scopes.includes('GAP')) {
    return 'px'
  }
}

export function tokenFilesFromLocalVariables(localVariablesResponse: GetLocalVariablesResponse) {
  const tokenFiles: { [fileName: string]: TokensFile } = {}
  const localVariableCollections = localVariablesResponse.meta.variableCollections
  const localVariables = localVariablesResponse.meta.variables

  Object.values(localVariables).forEach((variable) => {
    // Skip remote variables because we only want to generate tokens for local variables
    if (variable.remote) {
      return
    }

    const collection = localVariableCollections[variable.variableCollectionId]

    collection.modes.forEach((mode) => {
      const fileName = `${collection.name}.${mode.name}.json`

      if (!tokenFiles[fileName]) {
        tokenFiles[fileName] = {}
      }

      let obj: any = tokenFiles[fileName]

      // omit figma exclusive variables in the tokens
      if (variable.name.split('/')[0] !== 'figma-exclusive') {
        variable.name.split('/').forEach((groupName) => {
          obj[groupName] = obj[groupName] || {}
          obj = obj[groupName]
        })

        try {
          const token: Token = {
            $type: tokenTypeFromVariable(variable),
          }

          const tokenValue = tokenValueFromVariable(variable, mode.modeId, localVariables)
          const tokenUnit = tokenUnitFromVariable(variable)

          if (tokenUnit) {
            token['$value'] = {
              value: tokenValue,
              unit: tokenUnit,
            }
          } else {
            token['$value'] = tokenValue
          }

          token['$description'] = variable.description
          token['$extensions'] = {
            'com.figma': {
              hiddenFromPublishing: variable.hiddenFromPublishing,
              scopes: variable.scopes,
              codeSyntax: variable.codeSyntax,
            },
          }

          Object.assign(obj, token)
        } catch (e) {
          console.log('Fix this variable:', variable, 'with this mode: ', mode.modeId)
          console.log(e)
        }
      }
    })
  })

  return tokenFiles
}
