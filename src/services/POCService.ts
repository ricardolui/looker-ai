import { ILookmlModel, ILookmlModelExplore, ILookmlModelExploreField, ILookmlModelExploreFieldset, Looker40SDK } from "@looker/sdk";
import { IDictionary } from "@looker/sdk-rtl";
import LookerExploreDataModel from "../models/LookerExploreData";
import { UtilsHelper } from "../utils/Helper";
import { LookerSQLService } from "./LookerSQLService";
import { PromptTemplateService, PromptTemplateTypeEnum } from "./PromptTemplateService";
import { Logger } from "../utils/Logger"
import { ConfigReader } from "./ConfigReader";

export interface FieldMetadata{
    label: string;
    name: string;
    description: string;
    // type: string;
}

export interface ExploreMetadata{
    name: string;
    field_metadata: string;
}


export class POCService {
    private sql: LookerSQLService;
    private lookerSDK: Looker40SDK;

    public constructor(lookerSDK: Looker40SDK) {
        this.sql = new LookerSQLService(lookerSDK);
        this.lookerSDK = lookerSDK;
    }

    static readonly MAX_CHAR_PER_PROMPT: number = 8000*3;
    static readonly MAX_CHAR_PER_TILE: number = 15000*3;
    static readonly MIN_SUMMARIZE_CHAR_PER_TILE: number = 2000*3;

    public async getExploreMetadata(modelName: string,exploreName: string): Promise<Array<FieldMetadata>> {
        Logger.debug("3. Get the Explore Data");
        const exploreResponse = await this.lookerSDK.lookml_model_explore(modelName,exploreName,"id, name, description, fields, label");
        if (!exploreResponse.ok) {
            throw new Error('unable to fetch explore metadata');
        }
        const explore: ILookmlModelExplore = exploreResponse.value;
        const fields:ILookmlModelExploreFieldset = exploreResponse.value.fields!;
        const f_dimensions:ILookmlModelExploreField[]  =  fields.dimensions!;
        const f_measures:ILookmlModelExploreField[]  =  fields.measures!;
        const f_dim_measures = f_dimensions.concat(f_measures);
        var my_fields:Array<FieldMetadata> = [];
        if(f_dim_measures!=null)
        {
          for(var field of f_dim_measures)
          {
            var field_def:FieldMetadata = {
              // "field_type": "Dimension", this is not needed
              // "view_name": dimension.view_label,
              label : field.label!,
              name: field.name!,
              // "type": dimension.type,
              description: field.description!
              // "sql": dimension.sql,
            };
            my_fields.push(field_def);
          }          
        }
        return my_fields;
    }

    public async allModelExploreMetadata<ElementData>(modelName: string): Promise<Array<ExploreMetadata>> {
        Logger.debug("2. Get all Explores Data From Model");
        const my_explores:Array<ExploreMetadata> = [];
        const model = await this.lookerSDK.ok(this.lookerSDK.lookml_model(modelName));
        if(model){
            for(var explore of model.explores!){
                if(explore.name!=null){
                    // const exploreFieldMeta:string
                    const exploreMeta = await this.getExploreMetadata(modelName,explore.name)

                    var exp_def:ExploreMetadata={
                        name : explore.name!,
                        field_metadata: JSON.stringify(exploreMeta!)
                      };

                    my_explores.push(exp_def)
                }
            } 
        }else{
            throw new Error('model does not contain any explores');
        }
        return my_explores;
    }  

    public pocGeneratePrompt(
        modelName: string,
        explores: Array<ExploreMetadata>,
        question: string): string {
        
        const shardedPrompts:Array<string> = []; 
        var exploreDict:String=""
        var exploreNames:String=""
        if(explores){
          for(var explore of explores){
            exploreNames+=` ou ${explore.name}`;
            exploreDict+=`Dicionário de dados dos campos da view ${explore.name}: ${UtilsHelper.escapeSpecialCharacter(explore.field_metadata)}`;
          }
        }

        exploreNames=exploreNames.substring(3,exploreNames.length).replace(/\'/g, '\\\'');

        Logger.debug("1. Sending Prompt to BigQuery LLM");

        var examples = `input: Listar total de alunos por grupo de série e UF dos 10 primeiros estados com maior quantidade de alunos com probabilidade de evadir maior que 90%.
        output: {"model": "poc-results", "view": "results_prediction_evasao_v4", "fields": ["results_prediction_evasao_v4.estado_aluno", "results_prediction_evasao_v4.agg_serie", "results_prediction_evasao_v4.count"], filters=>{:"results_prediction_evasao_v4.predicted_score"=>0.9}, "sorts": ["results_prediction_evasao_v4.count desc"], "pivots": null, "limit": "10"}
        input: Total de alunos por região com previsão real de evadirem
        output: {"model": "poc-results", "view": "results_prediction_evasao_v4", "fields": ["results_prediction_evasao_v4.regiao_aluno", "results_prediction_evasao_v4.count"], "filters": {"results_prediction_evasao_v4.predicted_label": "evasao", "results_prediction_evasao_v4.prediction": "true_positive"}, "sorts": ["results_prediction_evasao_v4.count desc"], "pivots": null, "limit": "50"}
        input: Total de alunos por região com previsão real de evadirem que estão no primeiro quartil da base de predicao
        output: {"model": "poc-results", "view": "results_prediction_evasao_v4", "fields": ["results_prediction_evasao_v4.regiao_aluno", "results_prediction_evasao_v4.count"], "filters": {"results_prediction_evasao_v4.predicted_label": "evasao", "results_prediction_evasao_v4.prediction": "true_positive", "results_prediction_evasao_v4.quartil": "1st"}, "sorts": ["results_prediction_evasao_v4.count desc"], "pivots": null, "limit": "50"}
        input: Média de ticket mensal por alunos com previsão de evadirem
        output: {"model": "poc-results", "view": "results_prediction_evasao_v4", "fields": ["results_prediction_evasao_v4.avg_tk_mensal"], "filters":  {"results_prediction_evasao_v4.predicted_label": "evasao"}, "sorts": null, "pivots": null, "limit": "500"}
        input: Qual a quantidade de alunos por modalidade? Mostre as informacoes fazendo um pivot por quartil.
        output: {"model": "poc-results", "view": "results_prediction_evasao_v4", "fields": ["results_prediction_evasao_v4.modalidade", "results_prediction_evasao_v4.quartil", "results_prediction_evasao_v4.count"], "filters": null, "sorts": ["results_prediction_evasao_v4.count desc"], "pivots": ["results_prediction_evasao_v4.quartil"], "limit": "50"}
        input: Liste as 5 variaveis mais importantes para a previsão de evasão de um aluno
        output: {"model": "poc-results", "view": "evasao_features_attribution", "fields": ["evasao_features_attribution.field", "evasao_features_attribution.importance"], "filters":  null, "sorts": ["evasao_features_attribution.importance desc"], "pivots": null, "limit": "5"}
        input: Qual a quantidade de alunos agrupado por modalidade e tipo de aluno?
        output: {"model": "poc-results", "view": "results_prediction_evasao_v4", "fields": ["results_prediction_evasao_v4.modalidade", "results_prediction_evasao_v4.tipo_aluno", "results_prediction_evasao_v4.count"], "filters": null, "sorts": ["results_prediction_evasao_v4.count desc"], "pivots": null, "limit": "50"}
        `

        const promptExamples=examples

        var singleLineString = `Escreva uma saída simples seguindo os exemplos fornecidos a seguir. Use os seguintes dicionarios de dados para obter os campos, filtros e pivots necessários para a consulta.
        Sempre retorne o modelo: ${modelName}  e views: ${exploreNames}.
        ${exploreDict}
        ${promptExamples}
        input: ${question}
        output:
        `
        
        const prompt = JSON.stringify(singleLineString);

        Logger.debug(`The generated prompt is ${prompt}`);
        
        return prompt;        

    }


    private buildBigQueryLLMQuery(selectPrompt:string)
    {
        return `#Looker GenAI Extension - version: ${ConfigReader.CURRENT_VERSION}
        SELECT ml_generate_text_llm_result as r, ml_generate_text_status as status
        FROM
        ML.GENERATE_TEXT(
            MODEL ${ ConfigReader.BQML_MODEL} ,
            (
            ${selectPrompt}
            ),
            STRUCT(
            0.05 AS temperature,
            1024 AS max_output_tokens,
            0.98 AS top_p,
            TRUE AS flatten_json_output,
            40 AS top_k));
        `;
    }


    public async pocGeneratePromptSendToBigQuery(
        modelName: string,
        explores: Array<ExploreMetadata>,
        question: string) {
        
        const prompt = this.pocGeneratePrompt(modelName,explores,question);
        const subselect = `SELECT '${prompt}' AS prompt`;
        const sqlQuery = this.buildBigQueryLLMQuery(subselect);
        Logger.debug(`Executando a query de POC ${sqlQuery}`);

        try {
            const queryResults = await this.sql.execute<{
                r: string
                ml_generate_text_status: string
            }>(sqlQuery);
            var firstResult = UtilsHelper.firstElement(queryResults);
            if (!firstResult.r) {
                const generateTextStatus = firstResult.ml_generate_text_status
                if (!generateTextStatus) {
                    throw new Error('generated llm result does not contain expected colums');
                }
                throw new Error('generated llm result contains errors: ' + generateTextStatus);
            }
            return firstResult.r;

        } catch (error) {
            Logger.error(`Erro executando a query de POC ${sqlQuery}`);
            throw new Error(`Erro executando a query de POC ${sqlQuery}`);
        }
        
    }
}
