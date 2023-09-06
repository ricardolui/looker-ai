// Copyright 2023 Google LLC

import React, { useContext, useEffect, useState , FormEvent, useCallback} from 'react'
import { 
  Button, 
  ComponentsProvider,
  FieldTextArea,
  Space,
  Span,
  SpaceVertical,
  Spinner,
  FieldSelect, 
  ComboboxOptionObject,
  ComboboxCallback,
  MaybeComboboxOptionObject,
  TextArea
} from '@looker/components'
import { Dialog, DialogLayout} from '@looker/components'
import { ExtensionContext , ExtensionContextData } from '@looker/extension-sdk-react'
import { 
  IRequestAllLookmlModels,
  ILookmlModel,
  ISqlQueryCreate,
  ILookmlModelExploreFieldset,
  ILookmlModelExploreField,
  Looker40SDK
} from '@looker/sdk'
import { Box, Heading } from '@looker/components'
import { EmbedContainer } from './EmbedContainer'
import { ExploreEvent, LookerEmbedSDK} from '@looker/embed-sdk'
import { ExploreService, FieldMetadata } from '../services/ExploreService'
import { PromptTemplateService } from '../services/PromptTemplateService'
import { Logger } from '../utils/Logger'
import { ConfigReader } from '../services/ConfigReader'
import { PromptService } from '../services/PromptService'
import PromptModel from '../models/PromptModel'
import { POCService } from '../services/POCService'
/**
 * Looker GenAI - Explore Component
 */
export const POC: React.FC = () => {
  const { core40SDK } =  useContext(ExtensionContext)
  const [message, setMessage] = useState('')
  const [loadingLookerModels, setLoadingLookerModels] = useState<boolean>(false)
  const [loadingLLM, setLoadingLLM] = useState<boolean>(false)
  const [llmInsights, setLlmInsights] = useState<string>()
  const [lookerModels, setLookerModels] = useState<ILookmlModel[]>([])
  const [errorMessage, setErrorMessage] = useState<string>()
  const [allComboExplores, setAllComboExplores] = useState<ComboboxOptionObject[]>()  
  const [currentComboExplores, setCurrentComboExplores] = useState<ComboboxOptionObject[]>()
  const [selectedModelExplore, setSelectedModelExplore] = useState<string>()
  const [currentModelName, setCurrentModelName] = useState<string>()
  const [currentExploreName, setCurrentExploreName] = useState<string>()
  const [prompt, setPrompt] = useState<string>()
  const [currentExploreId, setCurrentExploreId] = useState<string>()
  const [exploreDivElement, setExploreDivElement] = useState<HTMLDivElement>()
  const [hostUrl, setHostUrl] = useState<string>()

  const [topPromptsCombos, setTopPromptsCombos] = useState<ComboboxOptionObject[]>()
  const [topPrompts, setTopPrompts] = useState<PromptModel[]>([])

  const [showInstructions, setShowInstructions] = useState<boolean>(true);

  const promptService: PromptService = new PromptService(core40SDK);

  useEffect(() => {
    // loadExplores();
    setCurrentModelName('poc-results')
    setPrompt("Quais foram as modalidades de curso com a maior quantidade de alunos com previsão de evadirem?")
    setShowInstructions(window.sessionStorage.getItem("showInstructions")==='true' || window.sessionStorage.getItem("showInstructions")==null)
  ;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function generateComboExploreFromModels(listModels: ILookmlModel[]) {
    const sortedModels = listModels.sort((a:ILookmlModel,b:ILookmlModel) => (a.name!=null&&b.name!=null)?a.name.localeCompare(b.name):0)

    var allValues:ComboboxOptionObject[] = [];
    sortedModels.forEach(model => {
      model.explores?.forEach(explore => {
        if( model!=null && explore!=null)
        {          
          const exp = {
            label: model.name + " - " + explore.name,
            value: model.name + "." + explore.name  
          };
          // @ts-ignore
          allValues.push(exp);
        }        
      })
    });
    // set Initial Combo Explore and All
    setAllComboExplores(allValues);
    setCurrentComboExplores(allValues);    
  }

  function generateCombosForTopPrompts(prompts: Array<PromptModel>) {
    var allValues:ComboboxOptionObject[] = [];
    prompts.forEach(promptModel => {
      allValues.push({
        label: promptModel.description,
        value: promptModel.modelExplore
      });                
    });
    setTopPromptsCombos(allValues);
  }

  const loadExplores = async () => {    
    setLoadingLLM(true);
    setLoadingLookerModels(true);
    setErrorMessage(undefined);
    try {
      const req: IRequestAllLookmlModels = {
      }
      const models = await core40SDK.ok(core40SDK.all_lookml_models(req));
      // const modelsPromise = core40SDK.ok(core40SDK.all_lookml_models(req));
      // const promptPromise = promptService.getExplorePrompts();
      // const [models, prompts] = await Promise.all([modelsPromise, promptPromise]);  
      setLookerModels(models);
      // setTopPrompts(prompts);
      generateComboExploreFromModels(models);  
      // generateCombosForTopPrompts(prompts);
      setLoadingLookerModels(false);
      setLoadingLLM(false);
    } catch (error) {
      setLoadingLookerModels(false)
      setErrorMessage('Error loading looks')
    }
  }


  const selectComboExplore = ((selectedValue: string) => {
    const splittedArray = selectedValue.split(".");
    if(splittedArray.length > 0 && splittedArray[0]!=null && splittedArray[1]!=null){
      setCurrentModelName(splittedArray[0]);    
      setCurrentExploreName(splittedArray[1]);              
    } 
    else{
      Logger.error("Error selecting combobox, modelName and exploreName are null or not divided by .");
    }       
    setSelectedModelExplore(selectedValue);
  });

  const selectTopPromptCombo = ((selectedValue: string) => {    
    selectComboExplore(selectedValue);
    topPrompts.forEach(topPrompt => {
      if(topPrompt.modelExplore === selectedValue)
      {
        setPrompt(topPrompt.prompt);        
      }
    });    
  });

  
  const onFilterComboBox = ((filteredTerm: string) => {
    Logger.info("Filtering");
    setCurrentComboExplores(allComboExplores?.filter(explore => explore.label!.toLowerCase().includes(filteredTerm.toLowerCase())));
  });

  const selectCurrentExploreName = (exploreName: string) => {
    setCurrentExploreName(exploreName);
  }

  // Method that clears the explores under the chat
  const handleClear = () => {    
    // Removes the first child    )
    setLlmInsights("");
    exploreDivElement?.removeChild(exploreDivElement.firstChild!);
  }

  const handleClearBottom = () => {    
    // Removes the first child
    exploreDivElement?.removeChild(exploreDivElement.lastChild!);
  }
  const handleClearAll = () => {    
    // Removes the first child
    if(exploreDivElement!=null && exploreDivElement.children!=null)
    {
      for(var i = 0; i < exploreDivElement.children.length; i++)
      {
        exploreDivElement?.removeChild(exploreDivElement.lastChild!);  
      }
    }
  }


  const handleChange = (e: FormEvent<HTMLTextAreaElement>) => {
    setPrompt(e.currentTarget.value)
  }
  
  function transformArrayToString(array: string[]): string {
    return array.join('\\n');
  }


  const extensionContext = useContext<ExtensionContextData>(ExtensionContext);


  const embedCtrRef = useCallback((el) => {
    setHostUrl(extensionContext?.extensionSDK?.lookerHostData?.hostUrl);    
    // set the explore div element outside
    setExploreDivElement(el);           
  }, [])

  // Method that triggers sending the message to the workflow
  const handleSend = async () =>
  {    
    handleClearAll();  
    setLoadingLLM(true);

    const generativePOCService = new POCService(core40SDK);

    // 1. Generate Prompt based on the current selected Looker Explore (Model + ExploreName)
    Logger.info("1. Get the Metadata from all Explores for Looker Model");   
    setCurrentModelName('poc-results')
    try {
      // const { modelName, queryId, view } = await generativePOCService.generatePromptSendToBigQuery(my_fields, prompt, currentModelName, viewName!);

      const modelData = await generativePOCService.allModelExploreMetadata(currentModelName!)
      const promptResult = await generativePOCService.pocGeneratePromptSendToBigQuery(currentModelName!,modelData, prompt!)
      const queryResult = await core40SDK.ok(core40SDK.run_inline_query({
        result_format: 'csv',
        body: JSON.parse(promptResult)}))
      setLlmInsights(queryResult)
    } catch (error) {
      if(error instanceof Error)
      {
        setLlmInsights(`Unexpected error: ${error.message}`);
      }
      else
      {
        setLlmInsights(`Unexpected error:` + error);
      }      
    } finally {
      setLoadingLLM(false);
    }
  }
  
  return (    
    <ComponentsProvider>
      <Space around>
        <Span fontSize="xxxxxlarge">
          {message}
        </Span>        
      </Space>      
      <SpaceVertical>
        <Space around> 
        <Heading fontWeight="semiBold"> Looker GenAI Extension</Heading>
        </Space>
        <Space around> 
        <Span> v:{ConfigReader.CURRENT_VERSION} - updated:{ConfigReader.LAST_UPDATED}</Span>
        </Space>
      </SpaceVertical>      
      <Box display="flex" m="large">        
          <SpaceVertical>
          {showInstructions? 
          <SpaceVertical>
            <Span fontSize="large">
            Quick Start:                                    
            </Span>  
            <Span fontSize="medium">
            1. Select the Explore by selecting or typing.
            </Span>          
            <Span fontSize="medium">
            2. Click on the Text Area and type your question to the Explore - <b>example: What are the top 15 count, language and day. Pivot per day</b>
            </Span>
            <Span fontSize="medium">
            3. Wait for the Explore to appear below and add to an dashboard if needed.
            </Span>                      
          </SpaceVertical> 
            : <Span/>
          }                  
          <Span fontSize="medium">
            Any doubts or feedback or bugs, send it to <b>looker-genai-extension@google.com</b>
          </Span>   
   
          <FieldTextArea            
            width="100%"
            label="Type your question"  
            value={prompt}
            onChange={handleChange}
          />
          <Space>
            <Button onClick={handleSend}>Send</Button>                     
          </Space>        
          <Dialog isOpen={loadingLLM}>
            <DialogLayout header="Loading LLM Data to Explore...">
              <Spinner size={80}>
              </Spinner>
            </DialogLayout>            
            </Dialog>        
          
          <TextArea
            disabled
            placeholder="Insights from LLM Model"
            value={llmInsights}
          />
        <EmbedContainer ref={embedCtrRef}>          
        </EmbedContainer>
        </SpaceVertical>                                   
      </Box>

    </ComponentsProvider>
  )
}


